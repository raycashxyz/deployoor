import { generateDeployers } from "deployoor/generate";
import { runAfterCompile } from "./runner";

// Minimal view of the Hardhat 3 runtime environment this action reads. Typed locally so the
// action needs no Hardhat-3 type dependency (the package's devDep is Hardhat 2 — see
// hardhat-v3-shim.d.ts). `paths.root` is the project root handed to `generateDeployers`.
interface Hardhat3CompileHre {
  readonly config: { readonly paths: { readonly root: string } };
}

/**
 * The Hardhat 3 `compile` task override: run the real compile via `runSuper`, then regenerate
 * deployoor's typed deployers from the fresh artifacts. Lives in its own module because Hardhat 3
 * requires plugin task actions to be lazy (`setAction(() => import(...))`) — it forbids inline
 * actions in plugins. A generate failure is reported, never rethrown (see `runAfterCompile`), so a
 * deployoor misconfiguration can't break `hardhat compile`.
 */
const generateAfterCompile = async (
  taskArguments: Record<string, unknown>,
  hre: Hardhat3CompileHre,
  runSuper: (taskArguments: Record<string, unknown>) => Promise<unknown>,
): Promise<unknown> => {
  const result = await runSuper(taskArguments);
  await runAfterCompile({ root: hre.config.paths.root, enabled: true, generate: generateDeployers });
  return result;
};

export default generateAfterCompile;
