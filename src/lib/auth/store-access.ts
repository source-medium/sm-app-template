/** Shared by the request guard, edge middleware, and warehouse query boundary. */
export class StoreAccessError extends Error {
  constructor() {
    super("This store is not available in this app.");
    this.name = "StoreAccessError";
  }
}

export function assertStoreAccess(fixedStoreId: string | null, requestedStoreId: string | undefined): void {
  if (fixedStoreId !== null && requestedStoreId !== fixedStoreId) throw new StoreAccessError();
}
