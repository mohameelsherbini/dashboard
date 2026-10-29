export function assertDirectCashTransaction<T extends { txnType: string }>(payload: T): T {
  if (payload.txnType !== "debit") {
    throw new Error("Custody funding requires an approved request and branch receipt");
  }
  return payload;
}
