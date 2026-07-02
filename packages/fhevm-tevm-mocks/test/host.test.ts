import { relayer } from "@fhevm/mock-utils";
import { createMemoryClient } from "tevm";

import {
  createFhevmTevmClients,
  createFhevmTevmRuntime,
  fhevmTevmDefaultAddresses,
  setupFhevmTevmHostContracts,
} from "../src/index.js";

describe("setupFhevmTevmHostContracts", () => {
  it("installs and initializes Zama host contracts in Tevm", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
    const clients = await createFhevmTevmClients(tevm);

    const setup = await setupFhevmTevmHostContracts(clients);

    await expect(
      clients.provider.send("eth_getCode", [fhevmTevmDefaultAddresses.ACLAddress, "latest"]),
    ).resolves.not.toBe("0x");
    expect(setup.contracts.kmsVerifier.getThreshold()).toBe(1);
    expect(setup.contracts.inputVerifier.getThreshold()).toBe(1);
    expect(setup.instance.config.aclContractAddress).toBe(fhevmTevmDefaultAddresses.ACLAddress);
    await expect(clients.provider.send(relayer.RELAYER_METADATA, [])).resolves.toMatchObject({
      ACLAddress: fhevmTevmDefaultAddresses.ACLAddress,
      gatewayChainId: 10901,
    });
  });

  it("creates a ready runtime in one call", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });

    const runtime = await createFhevmTevmRuntime(tevm);

    expect(runtime.tevm).toBe(tevm);
    expect(runtime.fhevm.contracts.kmsVerifier.getThreshold()).toBe(1);
    expect(runtime.fhevm.instance.chainId).toBe(runtime.chain.id);
    await expect(runtime.provider.send(relayer.RELAYER_METADATA, [])).resolves.toMatchObject({
      ACLAddress: fhevmTevmDefaultAddresses.ACLAddress,
    });
  });

  it("fails fast when a custom address does not match the compiled host bytecode", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
    const clients = await createFhevmTevmClients(tevm);

    // The FHEVMExecutor bytecode hard-codes the default ACL address, so overriding only the ACL
    // address must be rejected instead of silently producing an inconsistent host wiring.
    await expect(
      setupFhevmTevmHostContracts(clients, {
        addresses: { ACLAddress: "0x00000000000000000000000000000000000000ff" },
      }),
    ).rejects.toThrow(/getACLAddress/);
  });
});
