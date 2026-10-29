export function settlementRequestPayload(reason: string, amountHalalas?: number) {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) {
    throw new Error("Settlement reason must contain at least three characters");
  }
  return amountHalalas === undefined
    ? { reason: trimmedReason }
    : { reason: trimmedReason, amountHalalas };
}

export function requirePendingSettlement<T extends { status: string; balanceModified: boolean }>(result: T): T {
  if (result.status !== "pending" || result.balanceModified !== false) {
    throw new Error("Settlement request did not return a pending, unposted state");
  }
  return result;
}
