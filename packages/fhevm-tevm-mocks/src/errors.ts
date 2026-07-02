export class FhevmTevmMocksError extends Error {
  override readonly name = "FhevmTevmMocksError";
}

export function assertFhevmTevm(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new FhevmTevmMocksError(message);
  }
}

export function assertNoTevmErrors(result: { readonly errors?: readonly unknown[] }): void {
  if (result.errors !== undefined && result.errors.length > 0) {
    const first = result.errors[0];
    throw first instanceof Error ? first : new FhevmTevmMocksError(String(first));
  }
}
