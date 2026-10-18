import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";
import type { Operation } from "../../../api/types/index.ts";
import type { CashCountState, Shift } from "../../../api/types/company.ts";
import { apiOpToCOp, sumCOpAmounts } from "./operationMapping.ts";

// Synthetic Admin responses using the keys documented in handoff 02 §B.
// No staging requests or undocumented liability/revision fields are needed.
const baseOperation: Operation = {
  id: "operation-id",
  publicId: "SHF-001",
  moduleKey: "shifts",
  status: "pending",
  branchId: "branch-id",
  branchName: "فرع الاختبار",
  amountHalalas: 11500,
  operationDate: "2026-10-15",
  createdAt: "2026-10-15T12:00:00Z",
  updatedAt: "2026-10-15T12:00:00Z",
};

test("SHF preserves its source, review and counted FIN-01 financial evidence", () => {
  const review = { phase: "accountant_review", return_cycle: 0, return_reason: null };
  const op: Operation = {
    ...baseOperation,
    origin: "mobile",
    sourceId: "legacy-shift-id",
    reportReview: review,
    payload: {
      shiftId: "shift-id",
      legacyShiftId: "legacy-shift-id",
      salesHalalas: 11500,
      cardTotalHalalas: 5000,
      aggregatorTotalsHalalas: 2500,
      aggregatorBreakdown: [],
      openingFloatHalalas: 1000,
      cashExpectedHalalas: 5000,
      cashActualHalalas: 3000,
      varianceHalalas: -2000,
      cashCountState: "counted",
      pendingIncomingCountedHalalas: 0,
      varianceAllocations: [],
      pkg6Review: review,
    },
  };
  const before = structuredClone(op);
  const mapped = apiOpToCOp(op);

  assert.equal(mapped.module, "shifts");
  assert.equal(mapped.origin, "mobile");
  assert.equal(mapped.sourceId, op.sourceId);
  assert.strictEqual(mapped.reportReview, review);
  assert.strictEqual(mapped.payload, op.payload);
  assert.equal(mapped.payload?.cashCountState, "counted");
  assert.equal(mapped.payload?.varianceHalalas, -2000);
  assert.equal(mapped.amount, 115);
  assert.deepEqual(op, before, "mapping must not alter the API response");
});

test("daily sales report retains memberships and evidence revision IDs unchanged", () => {
  const review = {
    phase: "head_review",
    memberships: [{ report_revision: "evidence-revision-id" }],
    stale_members: [],
  };
  const op: Operation = {
    ...baseOperation,
    publicId: "DAY-001",
    moduleKey: "sales",
    status: "approved",
    origin: "mobile",
    sourceId: "daily-report-id",
    reportReview: review,
    payload: { pkg6Review: review },
  };
  const mapped = apiOpToCOp(op);

  assert.equal(mapped.module, "sales");
  assert.equal(mapped.status, "approved");
  assert.equal(mapped.sourceId, "daily-report-id");
  assert.equal(mapped.origin, "mobile");
  assert.strictEqual(mapped.reportReview, review);
  assert.deepEqual(mapped.payload, op.payload);
});

test("legacy operation without review keeps legacy channels and existing display defaults", () => {
  const op: Operation = {
    ...baseOperation,
    publicId: "OPS-001",
    moduleKey: "sales",
    brandName: "علامة الاختبار",
    payload: { channels: [] },
  };
  const mapped = apiOpToCOp(op, [{ name: "علامة الاختبار", color: "#123456" }]);

  assert.equal(mapped.reportReview, undefined);
  assert.equal(mapped.origin, undefined);
  assert.equal(mapped.sourceId, undefined);
  assert.strictEqual(mapped.payload, op.payload);
  assert.equal(mapped.moduleLabel, "مبيعات");
  assert.equal(mapped.brandColor, "#123456");
  assert.equal(mapped.match, "exact");
  assert.equal(mapped.attachments, 0);
  assert.equal(mapped.submittedBy, "—");
  assert.equal(mapped.salesBreakdown, null);
});

test("explicit null review and source stay null; absent payload stays absent", () => {
  const mapped = apiOpToCOp({ ...baseOperation, reportReview: null, sourceId: null, origin: null });
  assert.equal(mapped.reportReview, null);
  assert.equal(mapped.sourceId, null);
  assert.equal(mapped.origin, null);
  assert.equal(mapped.payload, undefined);
});

test("counted, unknown and null count states remain distinct even with zero variance", () => {
  for (const cashCountState of ["counted", "unknown", null] satisfies CashCountState[]) {
    const op: Operation = {
      ...baseOperation,
      payload: { cashCountState, varianceHalalas: 0, cashActualHalalas: null },
    };
    const mapped = apiOpToCOp(op);
    assert.equal(mapped.payload?.cashCountState, cashCountState);
    assert.equal(mapped.payload?.cashActualHalalas, null);
    assert.equal(mapped.payload?.varianceHalalas, 0);
  }
});

test("unknown and missing financial evidence is never filled with zero or a count", () => {
  const op: Operation = {
    ...baseOperation,
    payload: {
      cashCountState: "unknown",
      openingFloatHalalas: null,
      cashExpectedHalalas: null,
      cashActualHalalas: null,
      varianceHalalas: null,
    },
  };
  const mapped = apiOpToCOp(op);
  assert.deepEqual(mapped.payload, op.payload);
  assert.equal(mapped.payload?.salesHalalas, undefined);
  assert.equal(mapped.payload?.pendingIncomingCountedHalalas, undefined);
  assert.equal(apiOpToCOp({ ...baseOperation, payload: {} }).payload?.cashCountState, undefined);
});

test("null or absent operation amount stays unknown; zero, halalas and signs are preserved", () => {
  assert.equal(apiOpToCOp({ ...baseOperation, amountHalalas: null }).amount, null);
  const { amountHalalas: _amount, ...withoutAmount } = baseOperation;
  assert.equal(apiOpToCOp(withoutAmount).amount, null);
  assert.equal(apiOpToCOp({ ...baseOperation, amountHalalas: 0 }).amount, 0);
  assert.equal(apiOpToCOp({ ...baseOperation, amountHalalas: 11501 }).amount, 115.01);
  assert.equal(apiOpToCOp({ ...baseOperation, amountHalalas: -2000 }).amount, -20);
});

test("operation totals remain unknown if any mapped amount is unknown", () => {
  assert.equal(sumCOpAmounts([{ amount: 115 }, { amount: -20 }]), 95);
  assert.equal(sumCOpAmounts([{ amount: 115 }, { amount: null }]), null);
  assert.equal(sumCOpAmounts([{ amount: null }, { amount: 115 }]), null);
  assert.equal(sumCOpAmounts([{ amount: 0 }]), 0);
  assert.equal(sumCOpAmounts([]), 0);
});

test("nullable Shift presenter evidence is preserved when mapped into an SHF", () => {
  const evidence = {
    role: "cashier",
    ordersCount: null,
    openingFloatHalalas: null,
    cashExpectedHalalas: null,
    cashActualHalalas: null,
    varianceHalalas: null,
    cashCountState: null,
    pendingIncomingCountedHalalas: null,
    reportReview: {
      operation_id: "operation-id",
      public_id: "SHF-001",
      status: "pending",
      phase: "accountant_review",
      return_cycle: 0,
      return_reason: null,
      memberships: [],
    },
  } satisfies Pick<Shift, "role" | "ordersCount" | "openingFloatHalalas" | "cashExpectedHalalas" |
    "cashActualHalalas" | "varianceHalalas" | "cashCountState" | "pendingIncomingCountedHalalas" | "reportReview">;

  const payload = {
    cashCountState: evidence.cashCountState,
    openingFloatHalalas: evidence.openingFloatHalalas,
    cashExpectedHalalas: evidence.cashExpectedHalalas,
    cashActualHalalas: evidence.cashActualHalalas,
    varianceHalalas: evidence.varianceHalalas,
    pendingIncomingCountedHalalas: evidence.pendingIncomingCountedHalalas,
  };
  const mapped = apiOpToCOp({ ...baseOperation, payload, reportReview: evidence.reportReview });
  assert.deepEqual(mapped.payload, payload);
  assert.equal(mapped.payload?.cashCountState, null);
  assert.strictEqual(mapped.reportReview, evidence.reportReview);
});


test("workflowKind is preserved from server evidence, with missing classifier safely unknown", () => {
  for (const workflowKind of ["sal_day", "legacy_sales", "unknown"] as const) {
    const mapped=apiOpToCOp({...baseOperation,moduleKey:"sales",workflowKind,reportReview:null});
    assert.equal(mapped.workflowKind,workflowKind);
  }
  assert.equal(apiOpToCOp({...baseOperation,moduleKey:"sales",reportReview:null}).workflowKind,"unknown");
});


test("prototype retains canonical API identity independently of the human reference and workflow label", () => {
  const source=ts.createSourceFile("ASABPrototype.tsx",readFileSync(new URL("./ASABPrototype.tsx",import.meta.url),"utf8"),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  const fn=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==="mapApiOpToOp");
  assert.ok(fn);
  const js=ts.transpileModule(`${fn.getText(source)};return mapApiOpToOp;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const map=new Function("OP_MODULE_LABELS","relativeTimeAr","actorName",js)({},()=>"",()=>undefined);
  const mapped=map({...baseOperation,id:"canonical-uuid",publicId:"SAL-readable",workflowKind:"sal_day"});
  assert.equal(mapped.id,"SAL-readable");
  assert.equal(mapped.operationId,"canonical-uuid");
  assert.equal(mapped.workflowKind,"sal_day");
  assert.equal(map({...baseOperation,workflowKind:undefined}).workflowKind,"unknown");
});
