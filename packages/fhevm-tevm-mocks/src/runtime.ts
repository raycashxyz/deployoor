import {
  createFhevmTevmClients,
  type CreateFhevmTevmClientsOptions,
  type FhevmTevmClients,
} from "./client.js";
import {
  setupFhevmTevmHostContracts,
  type FhevmTevmHostContractsSetup,
  type SetupFhevmTevmHostContractsOptions,
} from "./host.js";

export type CreateFhevmTevmRuntimeOptions = CreateFhevmTevmClientsOptions & {
  readonly fhevm?: SetupFhevmTevmHostContractsOptions;
};

export interface FhevmTevmRuntime extends FhevmTevmClients {
  readonly fhevm: FhevmTevmHostContractsSetup;
}

export type SetupFhevmTevmRuntimeOptions = SetupFhevmTevmHostContractsOptions;

export const setupFhevmTevmRuntime = async (
  clients: FhevmTevmClients,
  options?: SetupFhevmTevmRuntimeOptions,
): Promise<FhevmTevmRuntime> => {
  const fhevm = await setupFhevmTevmHostContracts(clients, options);
  return { ...clients, fhevm };
};

export const createFhevmTevmRuntime = async (
  tevm: FhevmTevmClients["tevm"],
  options?: CreateFhevmTevmRuntimeOptions,
): Promise<FhevmTevmRuntime> => {
  const { fhevm: fhevmOptions, ...clientOptions } = options ?? {};
  const clients = await createFhevmTevmClients(tevm, clientOptions);
  return await setupFhevmTevmRuntime(clients, fhevmOptions);
};
