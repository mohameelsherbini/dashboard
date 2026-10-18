/** Head permissions from current operation evidence. Membership revision IDs are not member statuses. */
export type HeadOperation = {
  id:string;
  module?:string | null;
  moduleKey?:string | null;
  status:string;
  reportReview?:unknown;
  workflowKind?:unknown;
};

const moduleOf = (op:HeadOperation) => op.moduleKey ?? op.module;
const isRecord = (value:unknown):value is Record<string,unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const reviewOf = (op:HeadOperation):Record<string,unknown> | undefined =>
  isRecord(op.reportReview) ? op.reportReview : undefined;
const phaseOf = (op:HeadOperation) => {
  const phase = reviewOf(op)?.phase;
  return typeof phase === "string" ? phase : undefined;
};
// A non-null reportReview on a sales operation marks the protected day-report path,
// including malformed evidence that must fail closed instead of falling through to Legacy.
const workflowOf = (op:HeadOperation) => op.workflowKind === "sal_day" || op.workflowKind === "legacy_sales"
  ? op.workflowKind : "unknown";
const hasDayReviewMarker = (op:HeadOperation) => moduleOf(op) === "sales" &&
  (workflowOf(op) === "sal_day" || op.reportReview != null);
const isSalHeadReview = (op:HeadOperation) => typeof op.id === "string" && op.id.trim().length > 0 &&
  moduleOf(op) === "sales" && phaseOf(op) === "head_review";
const sameReviewIdentity = (row:HeadOperation, detail:HeadOperation) => {
  const rowReview = reviewOf(row);
  const detailReview = reviewOf(detail);
  if (!rowReview || !detailReview) return false;
  // The operation ID is the required day identity. When the API also supplies a
  // specific day/report link, require that link to remain stable across the refetch.
  for (const key of ["dayId", "managerShiftId", "reportId", "operationId"] as const) {
    const rowHasIdentity = Object.prototype.hasOwnProperty.call(rowReview, key);
    const detailHasIdentity = Object.prototype.hasOwnProperty.call(detailReview, key);
    if (rowHasIdentity && detailHasIdentity && rowReview[key] !== detailReview[key]) return false;
  }
  return true;
};
export const HEAD_DAY_EVIDENCE_HINT = {
  ar:"تعذّر التحقق من نوع العملية أو مرحلة مراجعتها؛ حدّث البيانات",
  en:"Operation workflow or review phase could not be verified; refresh the data",
};

export function getHeadReviewPolicy(op:HeadOperation | undefined, role:string | null | undefined, detail?:HeadOperation) {
  const denied = { finalApprove:false, returnForReview:false, blockedReason:null as string | null };
  if (!op || role !== "head" || op.status !== "approved" || typeof op.id !== "string" || !op.id.trim()) return denied;
  if (op.module != null && op.moduleKey != null && op.module !== op.moduleKey) return denied;
  if (detail && (detail.id !== op.id || detail.status !== "approved" || moduleOf(detail) !== moduleOf(op) ||
    (detail.module != null && detail.moduleKey != null && detail.module !== detail.moduleKey))) return denied;
  if (moduleOf(op) === "shifts") {
    if (phaseOf(op) !== "head_review" || (detail && phaseOf(detail) !== "head_review")) return denied;
    return { finalApprove:true, returnForReview:true, blockedReason:null };
  }
  if (moduleOf(op) === "sales") {
    const kind = workflowOf(op);
    if (kind === "unknown" || (detail && workflowOf(detail) !== kind)) {
      return { ...denied, blockedReason:"workflow_evidence_missing" };
    }
    if (kind === "sal_day") {
      // Eligibility permits a fresh fetch; Backend alone checks SHF finals and Snapshot.
      if (!isSalHeadReview(op) || (detail && (!isSalHeadReview(detail) || !sameReviewIdentity(op, detail)))) {
        return { ...denied, blockedReason:"day_evidence_missing" };
      }
      return { finalApprove:true, returnForReview:false, blockedReason:null };
    }
    if (hasDayReviewMarker(op) || (detail && hasDayReviewMarker(detail))) return denied;
  }
  return { finalApprove:true, returnForReview:true, blockedReason:null };
}

/** A protected row disables the entire selected bulk, never just silently drops that row. */
export function headLegacyBulkIds(ops:readonly HeadOperation[], ids:readonly string[], role:string | null | undefined,
  detailFor?: (op:HeadOperation)=>HeadOperation | undefined):string[] {
  if (role !== "head" || ids.length === 0) return [];
  const byId = new Map(ops.map(op => [op.id,op]));
  const unique = [...new Set(ids)];
  return unique.every(id => {
    const op = byId.get(id);
    const detail = op ? detailFor?.(op) : undefined;
    return op && moduleOf(op) !== "shifts" && !hasDayReviewMarker(op) &&
      !(detail && (moduleOf(detail) === "shifts" || hasDayReviewMarker(detail))) &&
      getHeadReviewPolicy(op, role, detail).finalApprove;
  }) ? unique : [];
}

/** Locks synchronously, refetches the operation, then sends at most one mutation. */
export async function runHeadFinalApproval(op:HeadOperation | undefined, role:string | null | undefined,
  loadDetail:(id:string)=>Promise<HeadOperation | undefined>, send:(id:string)=>Promise<unknown>, lock:{current:boolean}):Promise<boolean> {
  if (lock.current || !op || !getHeadReviewPolicy(op,role).finalApprove) return false;
  lock.current = true;
  try {
    const detail = await loadDetail(op.id);
    if (!detail || !getHeadReviewPolicy(op,role,detail).finalApprove) return false;
    await send(op.id);
    return true;
  } finally { lock.current = false; }
}
