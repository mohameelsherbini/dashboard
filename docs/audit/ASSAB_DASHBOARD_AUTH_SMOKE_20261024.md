# ASSAB ERP — Dashboard Staging Smoke & Environment Audit Report (GO-18)

**Date**: 2026-10-25
**Branch**: `001-dashboard-backend-integration-review`
**Base Commit**: `7602da1cb3446354b8229fc9a87115d48a74f154` (`staging/dashboard-m9-candidate-20261016` merged PR #4)
**Evaluator**: Antigravity (under ASSAB ERP Mandatory Evidence Protocol)
**Review Target**: Mahmoud (Project Owner) & Independent Reviewer

---

## 1. Environment & Infrastructure Reality (GO-18)

| Environment Component | Configured / Target URL | Deployed Attestation Status | Current Operational State |
|---|---|:---:|:---:|
| **Backend Staging (Coolify)** | `https://szkrjqiuo9s6d6nsy5fldc0j.62.72.19.141.sslip.io/` | **Confirmed Deployed SHA**: `26f86c683a17a8c5ebe19771186d6b35230d62cf` | `READY_FOR_SMOKE` (Backend SHA confirmed by Mahmoud from Coolify logs) |
| **Frontend Staging (Vercel)** | `Pending Vercel deployment of review branch` | **Awaiting Deployment & Attested SHA** | `NOT_RUN / BLOCKED` (Branch not yet deployed to Vercel) |
| **Legacy Hostinger Server** | `https://ivory-snail-183262.hostingersite.com` | **DEPRECATED / REJECTED** | Discontinued per review directive |

> **⚠️ Governance Compliance Standard**:
> 1. The Coolify Backend Staging origin is configured as `https://szkrjqiuo9s6d6nsy5fldc0j.62.72.19.141.sslip.io/`. Backend SHA `26f86c6` is confirmed from Coolify deployment logs.
> 2. Browser QA on Vercel remains strictly **`NOT_RUN`** because the review branch has not yet been deployed to Vercel.
> 3. Zero tests are claimed as `PASS` without verified runtime execution.
> 4. In-code assertions and offline unit tests are reported as `PASS` only for offline test suites.

---

## 2. Credentials Hygiene & Security Notice (SEC-1)

- **SEC-1 Security Finding**: The deprecated branch `001-dashboard-backend-integration` contained commit `7566377` in its history which exposed a test fixture password.
  - Mahmoud is responsible for rotating this password across Staging and Hostinger environments.
  - The approved review branch `001-dashboard-backend-integration-review` is built cleanly from ancestor `7602da1` and contains **zero** hardcoded passwords or leaked credentials in its commit history.
  - The deprecated branch must be deleted from the remote repository after verification.
  - Never cherry-pick commits from the deprecated branch.
- **Environment Variable Enforcement**: Credentials and endpoint origins must be supplied via shell / Secret Manager:
  - `ASSAB_STAGING_API_ORIGIN` (defaults to `https://szkrjqiuo9s6d6nsy5fldc0j.62.72.19.141.sslip.io`)
  - `ASSAB_STAGING_PASSWORD` (fixture password — never stored in Git)
  - `ASSAB_ROLELESS_EMAIL` (authenticated account with no assigned roles)
  - `ASSAB_VERCEL_FRONTEND_URL` (Vercel staging URL)
  - `ASSAB_DEPLOYMENT_ATTESTED` ("true" once deployment is confirmed)
- **Zero Token Leakage**: The smoke runner never outputs access tokens, refresh tokens, auth cookies, or personal identifiers.
- **Session Cleanup (S-4)**: Every role login executes `POST /api/v1/auth/logout` in a `try/finally` block to terminate the Sanctum session immediately after checks complete, preventing orphaned tokens.

---

## 3. Honest Acceptance & Execution Matrix (GO-18)

| Scope / Task ID | Requirement Description | Source Implementation | Automated Tests (Unit/AST) | Browser QA (Vercel) | Live Staging Runtime | Overall Item Status |
|:---:|---|:---:|:---:|:---:|:---:|:---:|
| **A1** (US1) | Company Admin Invitations Contract (`roleKey`, selectors, disabled guard) | `SOURCE_ACCEPTED` | `AUTOMATED_TEST_PASS` (6/6 tests) | `NOT_RUN` (No Vercel deploy) | `BLOCKED` | **AWAITING_DEPLOYMENT** |
| **A2** (US3) | Subscription Plans Route Realignment (`GET /plans`) | `SOURCE_ACCEPTED` | `AUTOMATED_TEST_PASS` (1/1 test) | `NOT_RUN` (No Vercel deploy) | `BLOCKED` | **AWAITING_DEPLOYMENT** |
| **B1** (US2) | Multi-Role Read-Only Staging Smoke & Currency Check | `SOURCE_ACCEPTED` | `AUTOMATED_TEST_PASS` | `NOT_RUN` (Awaiting Vercel URL) | `BLOCKED` (Awaiting Attestation) | **BLOCKED_ON_ENVIRONMENT** |
| **B2** (US4) | Branch Manager Scope Compatibility Verification | `SOURCE_ACCEPTED` (Guard preserved) | `AUTOMATED_TEST_PASS` | `NOT_RUN` | `BLOCKED` (Compatibility hold on fixture) | **BLOCKED_ON_BACKEND** |
| **C1** (US5) | Asset Depreciation Elimination (ASSET-01 in all views) | `SOURCE_ACCEPTED` | `AUTOMATED_TEST_PASS` (Expanded AST audit) | `NOT_RUN` (No Vercel deploy) | `BLOCKED` | **AWAITING_DEPLOYMENT** |
| **C2** (US6) | Employee Statement Debit Fallback (DIFF-04) | `SOURCE_ACCEPTED` | `AUTOMATED_TEST_PASS` (7/7 tests) | `NOT_RUN` (No Vercel deploy) | `BLOCKED` | **AWAITING_DEPLOYMENT** |
| **D1** (US7) | Obsolete Query Adapters Pruning & ERP Repointing | `SOURCE_ACCEPTED` | `AUTOMATED_TEST_PASS` (3/3 tests) | `NOT_RUN` | `BLOCKED` | **AWAITING_DEPLOYMENT** |
| **D-3** (P3) | Fixed 2-Decimal Currency Display for Asset Book Value | `SOURCE_IMPLEMENTED` | `AUTOMATED_TEST_PASS` (3/3 tests) | `NOT_RUN` (No Vercel deploy) | `BLOCKED` | **AWAITING_DEPLOYMENT** |
| **S-1** (P2) | Balanced Shift Verification (2026-10-24) | `SOURCE_IMPLEMENTED` | `AUTOMATED_TEST_PASS` (MATCH/MISMATCH/NOT_FOUND) | `NOT_RUN` | `BLOCKED` | **HARNESS_READY** |
| **S-2** (P3) | Head Review Queue via `GET /operations?moduleKey=shifts&pageSize=100` | `SOURCE_IMPLEMENTED` | `AUTOMATED_TEST_PASS` | `NOT_RUN` | `BLOCKED` | **HARNESS_READY** |
| **S-4** (P3) | Session Cleanup (`POST /auth/logout` via `try/finally`) | `SOURCE_IMPLEMENTED` | `AUTOMATED_TEST_PASS` | `NOT_RUN` | `BLOCKED` | **HARNESS_READY** |

---

## 4. Endpoint Contract Mapping & Classification Ledger (S-3)

All endpoints in `scripts/smoke-test-staging.ts` are mapped directly to actual Dashboard hooks. In accordance with directive **S-3**, the previous `OK` status column has been replaced with separate `EXPECTED` and `ACTUAL` columns:

| Role Tested | Endpoint | HTTP Method | Dashboard Hook Reference | EXPECTED | ACTUAL |
|---|---|:---:|---|---|:---:|
| **Accountant** | `/accountant/shifts/live` | `GET` | `usePlatformLiveShifts` | `HTTP 200 (Active shifts list)` | `NOT_RUN` |
| **Accountant** | `/accountant/shifts/history?dateFrom=2026-10-24&dateTo=2026-10-24` | `GET` | `usePlatformHistoryShifts` | `MATCH (salesHalalas: 11500, cash: 4000, variance: 0, counted)` | `NOT_RUN` |
| **Accountant** | `/accountant/shifts/history` | `GET` | `usePlatformHistoryShifts` | `HTTP 200 (Shift history)` | `NOT_RUN` |
| **Accountant** | `/accountant/operations` | `GET` | `useAccountantOperationsPlatform` | `HTTP 200 (amountHalalas integer)` | `NOT_RUN` |
| **Accountant** | `/accountant/employees` | `GET` | `usePlatformEmployees` | `HTTP 200 (Employee roster)` | `NOT_RUN` |
| **Accountant** | `/company/me/cash-custody` | `GET` | `useCashCustody` | `HTTP 200 (Cash custody balances)` | `NOT_RUN` |
| **Accountant** | `/company/me/asset-drafts` | `GET` | `useAssetDrafts` | `CONTRACT_MISSING (HTTP 404 until Backend E1)` | `NOT_RUN` |
| **Head Accountant** | `/plans` | `GET` | `useCompanyPlans` | `HTTP 200 (Subscription catalog)` | `NOT_RUN` |
| **Head Accountant** | `/head/erp/batches` | `GET` | `useERPBatches` | `HTTP 200 (ERP batches queue)` | `NOT_RUN` |
| **Head Accountant** | `/head/erp/eligible-operations` | `GET` | `useERPEligibleOperations` | `HTTP 200 (Eligible operations)` | `NOT_RUN` |
| **Head Accountant** | `/operations?moduleKey=shifts&pageSize=100` | `GET` | `useOperations` | `HTTP 200 (Pending head approval ops)` | `NOT_RUN` |
| **Company Admin** | `/company/me/users` | `GET` | `useCompanyUsers` | `HTTP 200 (Company users)` | `NOT_RUN` |
| **Company Admin** | `/company/invitations` | `GET` | `useCompanyInvitations` | `HTTP 200 (Pending invitations, read-only)` | `NOT_RUN` |
| **Company Admin** | `/plans` | `GET` | `useCompanyPlans` | `HTTP 200 (Subscription catalog)` | `NOT_RUN` |
| **Company Admin** | `/company/me/subscription` | `GET` | `useCompanySubscription` | `HTTP 200 (Subscription status)` | `NOT_RUN` |
| **Branch Manager** | `/auth/me` | `GET` | `useAuthMe` | `HTTP 200 (Fail-closed roleAccess guard check)` | `NOT_RUN` |
| **Branch Manager** | `/company/me/branch/overview` | `GET` | `usePlatformBranchOverview` | `HTTP 200 (Branch dashboard)` | `NOT_RUN` |
| **Role-less User** | `/company/me/shifts` | `GET` | `useRoleGuard` | `HTTP 403 + error.code: WRONG_ROLE + messageAr` | `NOT_RUN` |

---

## 5. Branch Manager Scope Contract Inspection (Task B2)

- **Direct Endpoint Call**: `GET /auth/me` with Bearer token.
- **Fail-Closed Guard Verification (`roleAccess.ts:25-39`)**:
  ```ts
  const isRoleKeyBranch = bRole?.key === "branch";
  const hasBranchScope = bRole?.scope === "branch";
  const isBrandIdsValid = validStringArray(bRole?.brandIds, UUID_PATTERN);
  const hasEmptyBrands = isBrandIdsValid && bRole.brandIds.length === 0;
  const isRestaurantIdsValid = validStringArray(bRole?.restaurantIds, UUID_PATTERN);
  const hasEmptyRestaurants = isRestaurantIdsValid && bRole.restaurantIds.length === 0;
  const isBranchIdsValid = validStringArray(bRole?.branchIds, UUID_PATTERN);
  const hasExactOneBranch = isBranchIdsValid && bRole.branchIds.length === 1;
  const isModuleKeysValid = validStringArray(bRole?.moduleKeys, MODULE_KEY_PATTERN);
  const guardPassed = Boolean(isRoleKeyBranch && hasBranchScope && hasExactOneBranch && hasEmptyBrands && hasEmptyRestaurants && isModuleKeysValid);
  ```
- **Policy Decision**:
  Do NOT modify or relax `roleAccess.ts:33`. Missing arrays are strictly NOT treated as empty. The compatibility hold remains logged for Mahmoud's resolution in backend tasks **E2** (`OnboardController.php`) and **E3** (`StagingHarnessProvisioner.php`).

---

## 6. Financial Halalas & Balanced Shift Protocol (S-1 & D-3)

### S-1: Balanced Shift Evidence Verification
- Endpoint: `GET /accountant/shifts/history?dateFrom=2026-10-24&dateTo=2026-10-24`
- Ineffective `netSalesHalalas` field check removed from `/accountant/shifts/live`.
- The target shift on `2026-10-24` is inspected against 5 exact invariants:
  1. `salesHalalas = 11500`
  2. `cashExpectedHalalas = 4000`
  3. `cashActualHalalas = 4000`
  4. `varianceHalalas = 0`
  5. `cashCountState = "counted"`
- **Outcome classification**:
  - `MATCH`: All 5 fields match approved fixture.
  - `MISMATCH`: Shift exists on 2026-10-24 but differs in values $\rightarrow$ classified as `FAIL` with explicit field mismatch list.
  - `NOT_FOUND`: No shift exists for 2026-10-24 $\rightarrow$ classified as `NOT_FOUND` (never `PASS`).
- Offline unit tests verify all three paths (`MATCH`, `MISMATCH`, `NOT_FOUND`).

### D-3: Asset Financial Formatting
- In `CompanyDashboard.tsx` (AccCompanyAssets), `fmtAmt` is applied to `(a.bookValueHalalas ?? 0) / 100`.
- Display formatting strictly preserves 2 fractional digits (`minimumFractionDigits: 2`, `maximumFractionDigits: 2`).
- Unit tests verify formatting for `12.00` SAR, `12.50` SAR, and `123.45` SAR across both English and Arabic locales.
- The global integer formatter (`fmt`) used for non-financial entity counts was preserved without modification.

---

## 7. Clarifications & Scope Boundaries (INFO-1 & INFO-2)

- **INFO-1 (VAT and Net Display)**:
  On Dashboard Browser QA, verifying Net=100 and VAT=15 is designated **`NOT_APPLICABLE`**. The Dashboard UI (`ShiftPresenter` / `ShiftOpPanel` / `إجمالي المبيعات (شامل الضريبة)`) intentionally renders gross amounts inclusive of VAT only. Net sales and VAT breakdowns are native to mobile responses (`summary.net_sales` and `vat_amount`) and do not exist as independent fields in Dashboard views.
- **INFO-2 (CASH-14 & CASH-16 Responsibilities)**:
  - `CASH-14`: Two-party confirmed transfer correction (`تصحيح تحويل مؤكد بين طرفين`).
  - `CASH-16`: Cashier repayment of shortage debt to branch manager (`سداد الكاشير لمديونية العجز للمدير`).
  - Both operations are **Backend-owned** and assigned to Mahmoud. They are not in the Dashboard GO-18 implementation scope.
- **Backend Open Tasks (E1–E4)**:
  - Tasks E1 (asset drafts endpoint), E2 (onboard branch role formatting), E3 (staging harness provisioner), and E4 remain open on the Backend side (Mahmoud WP1).
  - Task B2 remains on `BLOCKED` status until E2/E3 are deployed to Coolify and attested.
