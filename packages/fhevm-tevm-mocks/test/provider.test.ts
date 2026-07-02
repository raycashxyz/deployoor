import { createFhevmTevmProvider, type Eip1193Provider } from "../src/index.js";

describe("createFhevmTevmProvider", () => {
  it("intercepts configured RPC methods and forwards the rest", async () => {
    const forwarded: string[] = [];
    const baseProvider: Eip1193Provider = {
      async request(args) {
        forwarded.push(args.method);
        return { forwarded: args.method };
      },
    };
    const provider = createFhevmTevmProvider(baseProvider, {
      fhevm_test: async (args) => ({ intercepted: args.method, params: args.params }),
    });

    await expect(provider.request({ method: "fhevm_test", params: [1] })).resolves.toEqual({
      intercepted: "fhevm_test",
      params: [1],
    });
    await expect(provider.send("eth_chainId", [])).resolves.toEqual({ forwarded: "eth_chainId" });
    expect(forwarded).toEqual(["eth_chainId"]);
  });

  it("can register handlers after provider creation", async () => {
    const baseProvider: Eip1193Provider = {
      async request(args) {
        return { forwarded: args.method };
      },
    };
    const provider = createFhevmTevmProvider(baseProvider);
    provider.extendRpcHandlers({
      fhevm_late: async () => "registered",
    });

    await expect(provider.send("fhevm_late", [])).resolves.toBe("registered");
  });
});
