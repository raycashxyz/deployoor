import { createMemoryClient } from "tevm";

import {
  createFhevmTevmClients,
  createFhevmTevmRuntime,
  fhevmTevmDefaultAddresses,
  relayer,
} from "../src/index.js";

describe("createFhevmTevmClients", () => {
  it("wraps an existing Tevm instance instead of creating its own", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });

    const clients = await createFhevmTevmClients(tevm);

    expect(clients.tevm).toBe(tevm);
    await clients.state.setCode(fhevmTevmDefaultAddresses.ACLAddress, "0x6001600055");
    await expect(
      tevm.request({ method: "eth_getCode", params: [fhevmTevmDefaultAddresses.ACLAddress, "latest"] }),
    ).resolves.toBe("0x6001600055");
  });

  it("can prepare FHEVM on an existing Tevm instance in one call", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });

    const runtime = await createFhevmTevmRuntime(tevm);

    expect(runtime.tevm).toBe(tevm);
    await expect(runtime.provider.send(relayer.RELAYER_METADATA, [])).resolves.toMatchObject({
      ACLAddress: fhevmTevmDefaultAddresses.ACLAddress,
    });
  });
});
