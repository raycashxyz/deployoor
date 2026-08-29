import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { Data, Effect } from "effect";

/**
 * Asking a model directly, for the chat-only track.
 *
 * This track used to drive Claude Code with its tools denied, which was a subprocess standing in for
 * an HTTP call: brittle, one lab, and it measured a coding agent pretending not to be one. The
 * question here is what the ecosystem's models recommend, so it goes through the AI SDK and
 * OpenRouter, and adding a lab is a line in a list. The agentic track still spawns real CLIs,
 * because no HTTP call makes an agent scaffold a project.
 */

/**
 * The measurement set: five labs rather than five checkpoints of one vendor, and the tiers people
 * actually write code against.
 *
 * This list *is* the measurement, so it does not get swapped for something cheaper to save money.
 * The first baseline ran one coding-agent CLI and concluded that viem was already the default and
 * that Ignition was the incumbent to displace. Across these five, ethers outnumbers viem four to one
 * and Ignition never appears at all. Both conclusions were artifacts of the subject, not findings
 * about the ecosystem, and a cheap stand-in would introduce the same class of error more quietly.
 *
 * About 30p per pass at one trial.
 */
export const BASELINE_MODELS = [
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.1",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat-v3.1",
  "moonshotai/kimi-k2.5",
] as const;

/**
 * The development set: one cheap model, for checking that the harness works.
 *
 * A quarter of a penny per pass, roughly a hundredth of the baseline. Use it whenever the question
 * is "do rows complete, does the scorer fire, does the table render" rather than "what does the
 * ecosystem recommend". It is a real model over the real HTTP path, so the plumbing is genuinely
 * exercised; it is simply not the thing being measured, and its numbers are not a baseline.
 *
 * One model rather than two on purpose. `gemini-2.5-flash-lite` was the second, and it truncated at
 * 6000 tokens on a prompt the others answer in 1200, which makes a dev-loop check fail for reasons
 * that have nothing to do with the plumbing. Add a second lab here if a provider-specific bug is
 * ever suspected; it is one line.
 */
export const SMOKE_MODELS = ["openai/gpt-5-nano"] as const;

export const MODELS = [...BASELINE_MODELS, ...SMOKE_MODELS] as const;

/**
 * Low enough to bound what a runaway model can spend, high enough that a verbose one finishes. A
 * typical answer is about 1200 output tokens, but at 4000 three of 25 rows still truncated —
 * deepseek twice, gemini once — and a truncated row is lost data rather than a saving, since the
 * whole point of `AnswerTruncated` is that it is not evidence either way.
 */
export const MAX_OUTPUT_TOKENS = 6000;

/**
 * Reasoning tokens count against `maxOutputTokens`, so at the default effort the reasoning models
 * spent the whole budget thinking and hit the cap before answering: six of the first 25 rows failed
 * as `AnswerTruncated`, having billed for the thinking. Asking for low effort fixes the truncation
 * and roughly halves the cost.
 *
 * It does change what is measured, so it is worth being explicit: this eval asks which tool a model
 * names, not how well it justifies the choice. Recommendations are drawn from what a model already
 * associates with the problem, and that association is in the weights rather than in the thinking.
 * A model with more budget to deliberate does not thereby learn about a package it has never seen.
 */
export const REASONING_EFFORT = "low" as const;

export const API_KEY_VARIABLE = "OPENROUTER_API_KEY";

/**
 * Each error says what happened and what to do about it. Without an explicit `message`, Effect
 * renders a tagged error as "AnswerTruncated: An error has occurred", which named neither the model
 * nor the limit and sent me to the stack trace to find out which of 25 rows had failed.
 */
export class ApiKeyMissing extends Data.TaggedError("ApiKeyMissing")<{
  readonly variable: string;
}> {
  override get message(): string {
    return `${this.variable} is not set. Copy evals/.env.example to evals/.env and fill it in.`;
  }
}

export class ModelFailed extends Data.TaggedError("ModelFailed")<{
  readonly model: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `${this.model} did not answer: ${this.reason}`;
  }
}

export class AnswerTruncated extends Data.TaggedError("AnswerTruncated")<{
  readonly model: string;
  readonly limit: number;
}> {
  override get message(): string {
    return `${this.model} hit the ${this.limit}-token cap before finishing, so the answer is not evidence either way.`;
  }
}

export interface AnswerDeps {
  readonly apiKey?: string | undefined;
  readonly limit?: number;
}

/**
 * One prompt to one model, or a tagged error saying why there is no answer.
 *
 * Truncation is a failure rather than a short answer, for the same reason a timed-out CLI is: an
 * answer cut off mid-sentence is not evidence that the model would never have named deployoor, and
 * scoring it `absent` would quietly turn a budget cap into a finding.
 */
export const answer = (
  model: string,
  prompt: string,
  { apiKey = process.env[API_KEY_VARIABLE], limit = MAX_OUTPUT_TOKENS }: AnswerDeps = {},
): Effect.Effect<string, ApiKeyMissing | ModelFailed | AnswerTruncated> =>
  Effect.gen(function* () {
    if (apiKey === undefined || apiKey.length === 0)
      return yield* new ApiKeyMissing({ variable: API_KEY_VARIABLE });

    const openrouter = createOpenRouter({ apiKey });
    const result = yield* Effect.tryPromise({
      try: () =>
        generateText({
          model: openrouter(model),
          prompt,
          maxOutputTokens: limit,
          providerOptions: { openrouter: { reasoning: { effort: REASONING_EFFORT } } },
        }),
      catch: (cause) =>
        new ModelFailed({ model, reason: cause instanceof Error ? cause.message : String(cause) }),
    });

    if (result.finishReason === "length") return yield* new AnswerTruncated({ model, limit });

    return result.text;
  });
