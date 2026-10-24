import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runStagingSmoke, validStringArray, verifyBalancedShift, logout } from "../../../../../scripts/smoke-test-staging";

test("T028: Contract Test - smoke-test-staging.ts matches actual Dashboard hooks and endpoints", () => {
  const smokePath = new URL("../../../../../scripts/smoke-test-staging.ts", import.meta.url);
  const smokeContent = readFileSync(smokePath, "utf8");

  const cashQueryPath = new URL("./cash.ts", import.meta.url);
  const cashContent = readFileSync(cashQueryPath, "utf8");

  // 1. useCashCustody in cash.ts queries /company/me/cash-custody
  assert.ok(
    cashContent.includes('"/company/me/cash-custody"'),
    "useCashCustody must call GET /company/me/cash-custody",
  );

  // 2. smoke-test-staging.ts queries /company/me/cash-custody (with hyphen, not slash)
  assert.ok(
    smokeContent.includes('endpoint: "/company/me/cash-custody"'),
    "smoke-test-staging.ts must check /company/me/cash-custody matching useCashCustody",
  );
  assert.equal(
    smokeContent.includes('endpoint: "/company/me/cash/custody"'),
    false,
    "smoke-test-staging.ts must not contain obsolete /company/me/cash/custody",
  );

  // 3. S-1: Verify removal of ineffective netSalesHalalas from live shifts
  assert.equal(
    smokeContent.includes('halalaField: "netSalesHalalas"'),
    false,
    "smoke-test-staging.ts must not check non-existent netSalesHalalas field on /accountant/shifts/live",
  );
  assert.ok(
    smokeContent.includes('endpoint: "/accountant/shifts/history?dateFrom=2026-10-24&dateTo=2026-10-24"'),
    "smoke-test-staging.ts must check explicit 2026-10-24 shift history endpoint",
  );

  // 4. S-2: Head Accountant Queue uses /operations?moduleKey=shifts&pageSize=100 with useOperations
  assert.ok(
    smokeContent.includes('endpoint: "/operations?moduleKey=shifts&pageSize=100"'),
    "Head Accountant check must query GET /operations?moduleKey=shifts&pageSize=100",
  );
  assert.ok(
    smokeContent.includes('hookReference: "useOperations"'),
    "Head Accountant check must reference useOperations hook",
  );
  assert.equal(
    smokeContent.includes('/accountant/shifts/history?status=pending_head_approval'),
    false,
    "smoke-test-staging.ts must not query obsolete /accountant/shifts/history?status=pending_head_approval",
  );

  // 5. S-4: Session Cleanup via POST /auth/logout in try/finally
  assert.ok(
    smokeContent.includes("export async function logout("),
    "smoke-test-staging.ts must export a logout helper function",
  );
  assert.ok(
    smokeContent.includes("await logout(accToken)"),
    "Accountant role must call logout in finally block",
  );
  assert.ok(
    smokeContent.includes("await logout(headToken)"),
    "Head role must call logout in finally block",
  );
  assert.ok(
    smokeContent.includes("await logout(adminToken)"),
    "Admin role must call logout in finally block",
  );
  assert.ok(
    smokeContent.includes("await logout(branchToken)"),
    "Branch role must call logout in finally block",
  );

  // 6. Verify hook alignment across all smoke checks
  assert.ok(smokeContent.includes('hookReference: "usePlatformLiveShifts"'));
  assert.ok(smokeContent.includes('hookReference: "usePlatformHistoryShifts"'));
  assert.ok(smokeContent.includes('hookReference: "useAccountantOperationsPlatform"'));
  assert.ok(smokeContent.includes('hookReference: "usePlatformEmployees"'));
  assert.ok(smokeContent.includes('hookReference: "useCashCustody"'));
  assert.ok(smokeContent.includes('hookReference: "useCompanyPlans"'));
  assert.ok(smokeContent.includes('hookReference: "useERPBatches"'));
  assert.ok(smokeContent.includes('hookReference: "useCompanyUsers"'));
  assert.ok(smokeContent.includes('hookReference: "useAuthMe"'));
});

test("T029: S-1 Offline Unit Tests - verifyBalancedShift handles MATCH, MISMATCH, and NOT_FOUND", () => {
  // Case 1: MATCH - All 5 fields match approved 2026-10-24 fixture values exactly
  const matchPayload = {
    data: [
      {
        id: "shf-20261024-001",
        startedAt: "2026-10-24T06:00:00+03:00",
        endedAt: "2026-10-24T14:30:00+03:00",
        salesHalalas: 11500,
        cashExpectedHalalas: 4000,
        cashActualHalalas: 4000,
        varianceHalalas: 0,
        cashCountState: "counted",
      },
    ],
  };
  const matchResult = verifyBalancedShift(matchPayload, "2026-10-24");
  assert.equal(matchResult.status, "MATCH");
  assert.equal(matchResult.shiftId, "shf-20261024-001");
  assert.equal(matchResult.actual?.salesHalalas, 11500);
  assert.equal(matchResult.actual?.cashExpectedHalalas, 4000);
  assert.equal(matchResult.actual?.cashActualHalalas, 4000);
  assert.equal(matchResult.actual?.varianceHalalas, 0);
  assert.equal(matchResult.actual?.cashCountState, "counted");
  assert.equal(matchResult.mismatches, undefined);

  // Case 2: MISMATCH - Target shift on 2026-10-24 has differing values (e.g. variance, sales, cashCountState)
  const mismatchPayload = {
    data: [
      {
        id: "shf-20261024-002",
        startedAt: "2026-10-24T14:30:00+03:00",
        endedAt: "2026-10-24T23:00:00+03:00",
        salesHalalas: 12000, // Expected 11500
        cashExpectedHalalas: 4000,
        cashActualHalalas: 3800, // Expected 4000
        varianceHalalas: -200, // Expected 0
        cashCountState: "unknown", // Expected "counted"
      },
    ],
  };
  const mismatchResult = verifyBalancedShift(mismatchPayload, "2026-10-24");
  assert.equal(mismatchResult.status, "MISMATCH");
  assert.equal(mismatchResult.shiftId, "shf-20261024-002");
  assert.ok(mismatchResult.mismatches && mismatchResult.mismatches.length === 4);
  assert.ok(mismatchResult.mismatches.some(m => m.field === "salesHalalas" && m.expected === 11500 && m.actual === 12000));
  assert.ok(mismatchResult.mismatches.some(m => m.field === "cashActualHalalas" && m.expected === 4000 && m.actual === 3800));
  assert.ok(mismatchResult.mismatches.some(m => m.field === "varianceHalalas" && m.expected === 0 && m.actual === -200));
  assert.ok(mismatchResult.mismatches.some(m => m.field === "cashCountState" && m.expected === "counted" && m.actual === "unknown"));

  // Case 3A: NOT_FOUND - Empty data array returned
  const notFoundEmpty = verifyBalancedShift({ data: [] }, "2026-10-24");
  assert.equal(notFoundEmpty.status, "NOT_FOUND");
  assert.ok(notFoundEmpty.message.includes("No shifts found"));

  // Case 3B: NOT_FOUND - Shifts exist but only for other dates (e.g. 2026-10-23)
  const notFoundOtherDate = verifyBalancedShift({
    data: [
      {
        id: "shf-20261023-001",
        startedAt: "2026-10-23T06:00:00+03:00",
        endedAt: "2026-10-23T14:30:00+03:00",
        salesHalalas: 11500,
        cashExpectedHalalas: 4000,
        cashActualHalalas: 4000,
        varianceHalalas: 0,
        cashCountState: "counted",
      },
    ],
  }, "2026-10-24");
  assert.equal(notFoundOtherDate.status, "NOT_FOUND");
  assert.ok(notFoundOtherDate.message.includes("No shift matching target date 2026-10-24"));
});

test("T028: Staging Readiness Gate - Blocks execution and makes zero requests when attestation is missing", async () => {
  // Run smoke without setting credentials or attestation
  const report = await runStagingSmoke();

  assert.equal(report.environmentState, "BLOCKED — NO REQUESTS EXECUTED");
  assert.ok(report.blockers.length >= 2, "Must report blockers for missing credentials and operator attestation");
  assert.ok(
    report.blockers.some(b => b.includes("ASSAB_STAGING_PASSWORD")),
    "Must block on missing password",
  );
  assert.ok(
    report.blockers.some(b => b.includes("deployment SHA is not yet attested")),
    "Must block on missing deployment attestation",
  );

  // All roles must report BLOCKED with zero endpoints executed
  assert.ok(report.results.length >= 4, "Must list all configured roles in blocked state");
  for (const r of report.results) {
    assert.equal(r.loginStatus, "BLOCKED", `${r.role} must be BLOCKED`);
    assert.equal(r.endpoints.length, 0, `${r.role} must have 0 executed endpoints`);
  }
});

test("T028: WRONG_ROLE Envelope - Requires HTTP 403, error.code, and messageAr together (AND logic)", () => {
  const smokePath = new URL("../../../../../scripts/smoke-test-staging.ts", import.meta.url);
  const smokeContent = readFileSync(smokePath, "utf8");

  // Verify WRONG_ROLE parsing logic
  assert.ok(
    smokeContent.includes('errEnvelope?.code === "WRONG_ROLE"'),
    "Must verify error.code === 'WRONG_ROLE'",
  );
  assert.ok(
    smokeContent.includes('typeof errEnvelope?.messageAr === "string" && errEnvelope.messageAr.trim().length > 0'),
    "Must verify non-empty error.messageAr string",
  );
  assert.ok(
    smokeContent.includes("isHttp403 && hasWrongRoleCode && hasNonEmptyMessageAr"),
    "All 3 WRONG_ROLE conditions must be required together via boolean AND",
  );
});

test("T028: Strict Branch Guard - Conforms to roleAccess.ts without auto-empty fallbacks", () => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 1. Missing or undefined brandIds/restaurantIds must NOT be treated as empty array
  assert.equal(validStringArray(undefined, uuidPattern), false, "undefined is not a valid array");
  assert.equal(validStringArray(null, uuidPattern), false, "null is not a valid array");
  assert.equal(validStringArray("not-array", uuidPattern), false, "string is not a valid array");

  // 2. Empty arrays are valid
  assert.equal(validStringArray([], uuidPattern), true, "Empty array is valid");

  // 3. Array with invalid UUID format is rejected
  assert.equal(validStringArray(["invalid-uuid"], uuidPattern), false, "Non-UUID string is rejected");

  // 4. Array with valid UUID is accepted
  const validUuid = "12345678-1234-1234-1234-123456789abc";
  assert.equal(validStringArray([validUuid], uuidPattern), true, "Valid UUID is accepted");
});
