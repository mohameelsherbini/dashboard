import test from "node:test";
import assert from "node:assert/strict";
import { assertDirectCashTransaction } from "./cashTransactionContract.ts";

test("direct cash transaction permits disbursement and rejects funding", () => {
  const debit = { txnType: "debit", amount: 30000 };
  assert.equal(assertDirectCashTransaction(debit), debit);
  assert.throws(() => assertDirectCashTransaction({ txnType: "credit", amount: 30000 }), /funding/);
});
