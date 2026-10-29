import test from "node:test";
import assert from "node:assert/strict";
import { requirePendingSettlement, settlementRequestPayload } from "./employeeSettlementContract.ts";

test("settlement request sends a required reason and optional amount", () => {
  assert.deepEqual(settlementRequestPayload("  Reconcile balance  "), { reason: "Reconcile balance" });
  assert.deepEqual(settlementRequestPayload("Partial payment", 30000), { reason: "Partial payment", amountHalalas: 30000 });
  assert.throws(() => settlementRequestPayload("  "), /reason/);
});

test("settlement creation only accepts a pending request without financial posting", () => {
  const pending = { settlementId: "request-1", status: "pending", balanceModified: false };
  assert.equal(requirePendingSettlement(pending), pending);
  assert.throws(() => requirePendingSettlement({ status: "approved", balanceModified: true }));
  assert.throws(() => requirePendingSettlement({ status: "pending", balanceModified: true }));
});
