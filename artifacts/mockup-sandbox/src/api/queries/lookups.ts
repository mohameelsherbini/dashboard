import { useQuery } from "@tanstack/react-query";
import { api } from "../client";
import type { LookupRow } from "../types";
import type {
  OperationEnumsCatalogue,
  RejectionReasonOption,
} from "../types/company";
import { queryKeys, type LookupType } from "./keys";
import { parseLookupsResponse } from "../responseContracts";

export function useLookup(type: LookupType, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.lookup(type, params),
    queryFn: async () => {
      const res = await api.get<unknown>(`/company/me/lookups/${type}`, {
        params,
      });
      return parseLookupsResponse(res.data, type);
    },
    staleTime: 5 * 60_000, // lookups change infrequently
  });
}

// Branch-scoped employee auto-fill by employee number (T04 §7).
// Returns { empNumber, name }; 404s when unknown or in another branch.
export interface EmployeeLookupResult {
  empNumber: string;
  name: string;
}

export function useBranchEmployeesLookup(
  branchId: string | null | undefined,
  empNumber?: string | null,
) {
  return useQuery({
    queryKey: ["lookups", "branch-employees", branchId, empNumber ?? ""] as const,
    enabled: Boolean(branchId) && Boolean(empNumber),
    retry: false, // an unknown number → 404, don't hammer
    queryFn: async () => {
      const res = await api.get<EmployeeLookupResult>(
        `/company/me/branches/${branchId}/employees/lookup`,
        { params: { empNumber } },
      );
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Rejection reasons (T03 §13) ─────────────────────────────────────────────
export function useRejectionReasons(moduleKey?: string) {
  return useQuery({
    queryKey: queryKeys.rejectionReasons(moduleKey),
    queryFn: async () => {
      const res = await api.get<
        { data: RejectionReasonOption[] } | RejectionReasonOption[]
      >("/lookups/rejection-reasons", {
        params: moduleKey ? { moduleKey } : undefined,
      });
      const d = res.data;
      return Array.isArray(d) ? d : (d.data ?? []);
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Operation enum catalogue (T03 §14) — fetch once at boot ─────────────────
export function useOperationEnums() {
  return useQuery({
    queryKey: queryKeys.operationEnums,
    queryFn: async () => {
      const res = await api.get<OperationEnumsCatalogue>(
        "/lookups/operation-enums",
      );
      return res.data;
    },
    staleTime: 30 * 60_000,
  });
}
