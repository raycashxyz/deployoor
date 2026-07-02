import { Context, Effect, Layer, Option } from "effect";
import { InvalidDeploymentRecord } from "../errors";
import type { DeploymentRecord } from "../schemas";
import type { StoreAdapter } from "../store";

/** Internal Effect-facing store service (the engine depends on this tag). */
export interface StoreService {
  readonly lock: (
    network: string,
    name: string,
  ) => Effect.Effect<() => Effect.Effect<void>, InvalidDeploymentRecord>;
  readonly read: (
    network: string,
    name: string,
  ) => Effect.Effect<Option.Option<DeploymentRecord>, InvalidDeploymentRecord>;
  readonly write: (record: DeploymentRecord) => Effect.Effect<void, InvalidDeploymentRecord>;
  readonly list: (network: string) => Effect.Effect<ReadonlyArray<DeploymentRecord>, InvalidDeploymentRecord>;
  readonly remove: (network: string, name: string) => Effect.Effect<void, InvalidDeploymentRecord>;
}

export class Store extends Context.Tag("deployoor/Store")<Store, StoreService>() {}

/** Lift a plain (sync-or-async) StoreAdapter into the Effect Store layer. */
export const layerFromAdapter = (adapter: StoreAdapter): Layer.Layer<Store> =>
  Layer.succeed(Store, {
    lock: (network, name) =>
      Effect.tryPromise({
        try: async () => {
          const release = await adapter.lock?.(network, name);
          return () =>
            Effect.tryPromise({
              try: async () => {
                await release?.();
              },
              catch: (cause) =>
                new InvalidDeploymentRecord({ path: `${network}/${name}.lock`, issues: String(cause) }),
            }).pipe(Effect.catchAll(() => Effect.void));
        },
        catch: (cause) =>
          new InvalidDeploymentRecord({ path: `${network}/${name}.lock`, issues: String(cause) }),
      }),
    read: (network, name) =>
      Effect.tryPromise({
        try: async () => Option.fromNullable(await adapter.read(network, name)),
        catch: (cause) => new InvalidDeploymentRecord({ path: `${network}/${name}`, issues: String(cause) }),
      }),
    write: (record) =>
      Effect.tryPromise({
        try: async () => {
          await adapter.write(record);
        },
        catch: (cause) => new InvalidDeploymentRecord({ path: record.deploymentName, issues: String(cause) }),
      }),
    list: (network) =>
      Effect.tryPromise({
        try: async () => adapter.list(network),
        catch: (cause) => new InvalidDeploymentRecord({ path: network, issues: String(cause) }),
      }),
    remove: (network, name) =>
      Effect.tryPromise({
        try: async () => {
          await adapter.remove(network, name);
        },
        catch: (cause) => new InvalidDeploymentRecord({ path: `${network}/${name}`, issues: String(cause) }),
      }),
  } satisfies StoreService);
