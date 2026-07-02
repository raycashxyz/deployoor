/** The slice of a generated file this plugin reports on (the full record carries `contents` too). */
export interface GeneratedFileInfo {
  readonly path: string;
}

export interface RunAfterCompileOptions {
  /** Project root handed to `generateDeployers` (Hardhat's `config.paths.root`). */
  readonly root: string;
  /** When false, generation is skipped — the `deployoor: { generate: false }` opt-out. */
  readonly enabled: boolean;
  /** The generate function, injected so this wiring is testable without a Hardhat runtime. */
  readonly generate: (opts: { root: string }) => Promise<ReadonlyArray<GeneratedFileInfo>>;
  /** Where progress/failures are reported. Defaults to the console. */
  readonly log?: { info: (message: string) => void; warn: (message: string) => void };
}

/**
 * Run `deployoor generate` after a Hardhat compile. A generation failure (e.g. no config yet,
 * nothing compiled) is reported but never rethrown, so a deployoor misconfiguration can never
 * break `hardhat compile` itself.
 */
export const runAfterCompile = async (opts: RunAfterCompileOptions): Promise<void> => {
  if (!opts.enabled) return;
  const log = opts.log ?? {
    info: (message: string) => console.log(message),
    warn: (message: string) => console.warn(message),
  };
  try {
    const files = await opts.generate({ root: opts.root });
    log.info(`deployoor: generated ${files.length} deployer file(s)`);
  } catch (error) {
    log.warn(`deployoor: skipped generate — ${error instanceof Error ? error.message : String(error)}`);
  }
};
