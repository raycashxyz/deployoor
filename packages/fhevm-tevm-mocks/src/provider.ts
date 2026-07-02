export type Eip1193RequestParameters = readonly unknown[] | Record<string, unknown>;

export interface Eip1193RequestArguments {
  readonly method: string;
  readonly params?: Eip1193RequestParameters;
}

export interface Eip1193Provider {
  request(args: Eip1193RequestArguments): Promise<unknown>;
}

export interface FhevmRpcHandlerContext {
  readonly baseProvider: Eip1193Provider;
  readonly provider: FhevmTevmProvider;
}

export type FhevmRpcHandler = (
  args: Eip1193RequestArguments,
  context: FhevmRpcHandlerContext,
) => Promise<unknown> | unknown;

export type FhevmRpcHandlers = Readonly<Record<string, FhevmRpcHandler | undefined>>;

export interface FhevmTevmProvider extends Eip1193Provider {
  readonly baseProvider: Eip1193Provider;
  readonly handlers: FhevmRpcHandlers;
  extendRpcHandlers(handlers: FhevmRpcHandlers): void;
  send(method: string, params?: readonly unknown[]): Promise<unknown>;
  setRpcHandler(method: string, handler: FhevmRpcHandler | undefined): void;
}

export const createFhevmTevmProvider = (
  baseProvider: Eip1193Provider,
  handlers: FhevmRpcHandlers = {},
): FhevmTevmProvider => {
  const activeHandlers: Record<string, FhevmRpcHandler | undefined> = { ...handlers };
  let provider: FhevmTevmProvider;
  provider = {
    baseProvider,
    handlers: activeHandlers,
    extendRpcHandlers(newHandlers) {
      Object.assign(activeHandlers, newHandlers);
    },
    async request(args) {
      const handler = activeHandlers[args.method];
      if (handler !== undefined) {
        return await handler(args, { baseProvider, provider });
      }

      return await baseProvider.request(args);
    },
    async send(method, params = []) {
      return await provider.request({ method, params });
    },
    setRpcHandler(method, handler) {
      activeHandlers[method] = handler;
    },
  };

  return provider;
};
