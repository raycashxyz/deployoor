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
 * Five labs rather than five checkpoints of one vendor. Mid-tier rather than flagship: these are the
 * models people actually write code against, and the flagship tiers would eat the month's budget in
 * a single pass.
 */
export const MODELS = [
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.1",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat-v3.1",
  "moonshotai/kimi-k2.5",
] as const;

/**
 * Generous enough that a recommendation finishes on its own — a full answer measures about 1200
 * output tokens — and low enough to bound what a runaway model can spend.
 */
export const MAX_OUTPUT_TOKENS = 4000;

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
