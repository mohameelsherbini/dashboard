import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { fundingExecutionPayload, requirePendingReceipt } from "./fundingExecutionContract";

export type FundingRequest = {
  id: string;
  branchName: string | null;
  submittedBy: string | null;
  status: "approved" | "completed";
  amount: string;
  preferredReceiptMethod: string | null;
  purpose: string | null;
  executedAt: string | null;
  receivedAt: string | null;
  transferReference: string | null;
  canExecute: boolean;
};

const key = ["cash-custody", "funding-requests", "accountant"] as const;

export async function fetchAccountantFundingRequests(): Promise<FundingRequest[]> {
  const response = await api.get<{ data: { requests: FundingRequest[] } }>("/custody/requests");
  return response.data.data.requests;
}

export async function executeFundingRequest({ id, reference, proof }: { id: string; reference: string; proof: File }) {
  const form = fundingExecutionPayload(reference, proof);
  const response = await api.post<{ data: { financiallyPosted: false; executedAt: string } }>(
    `/custody/requests/${encodeURIComponent(id)}/execute`, form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return requirePendingReceipt(response.data.data);
}

export function useAccountantFundingRequests(enabled: boolean) {
  return useQuery({
    queryKey: key,
    enabled,
    queryFn: fetchAccountantFundingRequests,
  });
}

export function useExecuteFundingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: executeFundingRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
