export function fundingExecutionPayload(reference: string, proof: File): FormData {
  const cleanReference = reference.trim();
  if (cleanReference.length < 2 || cleanReference.length > 120) throw new Error("Invalid transfer reference");
  const form = new FormData();
  form.append("transferReference", cleanReference);
  form.append("proof", proof);
  return form;
}

export function requirePendingReceipt<T extends { financiallyPosted: boolean; executedAt?: string | null }>(result: T): T {
  if (result.financiallyPosted !== false || !result.executedAt) {
    throw new Error("Unexpected custody execution response");
  }
  return result;
}
