// Ambient types for the OPTIONAL tevm compiler toolchain. deployoor's core does not depend
// on tevm — the tevm artifact adapter (src/artifacts/tevm.ts) lazy-imports @tevm/compiler
// only when a tevm project is detected, and the user installs it (declared as an optional
// peer). These minimal declarations let the adapter type-check and build without pulling
// tevm into the core dependency graph; at runtime the real package resolves from the
// consuming project. Only the surface the adapter uses is declared.
declare module "@tevm/compiler" {
  export interface TevmSolcBytecode {
    readonly object: string;
    readonly linkReferences?: Record<
      string,
      Record<string, ReadonlyArray<{ readonly start: number; readonly length: number }>>
    >;
  }
  export interface TevmSolcContract {
    readonly abi: unknown;
    readonly evm?: { readonly bytecode?: TevmSolcBytecode };
  }
  export interface TevmSolcInput {
    readonly language: string;
    readonly sources: Record<string, { readonly content: string }>;
    readonly settings?: Record<string, unknown>;
  }
  export interface TevmSolcOutput {
    readonly contracts?: Record<string, Record<string, TevmSolcContract>>;
  }
  export interface TevmResolvedArtifacts {
    readonly solcInput?: TevmSolcInput;
    readonly solcOutput?: TevmSolcOutput;
  }
  export interface TevmFileAccessObject {
    readonly readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
    readonly readFileSync: (path: string, encoding: BufferEncoding) => string;
    readonly existsSync: (path: string) => boolean;
    readonly exists: (path: string) => Promise<boolean>;
  }
  export interface TevmLogger {
    readonly info: (message: string) => void;
    readonly warn: (message: string) => void;
    readonly error: (message: string) => void;
    readonly log: (message: string) => void;
  }
  export function resolveArtifacts(
    solFile: string,
    basedir: string,
    logger: TevmLogger,
    config: unknown,
    includeAst: boolean,
    includeBytecode: boolean,
    fao: TevmFileAccessObject,
    solc: unknown,
  ): Promise<TevmResolvedArtifacts>;
}
