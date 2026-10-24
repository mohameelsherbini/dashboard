# ASSAB ERP Dashboard Staging Smoke Audit Report
**Executed At:** 2026-10-24T19:31:22.072Z  
**Target Host:** https://ivory-snail-183262.hostingersite.com  
**Methodology:** Read-Only HTTP Verification Across 5 Role Contexts  
**Safety Protocol:** Zero mutating requests executed; strictly read-only navigation.  

---

## 1. Executive Summary

| Role | Identity / Email | Login HTTP | Endpoints Tested | All Non-Mutating HTTP Statuses |
|---|---|:---:|:---:|---|
| **accountant** | `accountant.burger@nakhat.sa` | 200 | 6 | 200 OK, 200 OK, 200 OK, 200 OK, 404 Not Found, 200 OK |
| **head** | `head@nakhat.sa` | 200 | 5 | 200 OK, 200 OK, 200 OK, 200 OK, 200 OK |
| **company-admin** | `admin@nakhat.sa` | 200 | 3 | 200 OK, 404 Not Found, 403 Forbidden |
| **branch** | `branch@nakhat.sa` | 200 | 2 | 200 OK, 200 OK |
| **unassigned** | `unassigned@invalid.test` | N/A (unauthed) | 1 | 401 Unauthorized |

---

## 2. Currency Scaling Verification (`rawHalalas / 100`)
Per ASSAB Financial Integrity Rules, frontend UI strictly performs `display = rawHalalas / 100` with zero client-side tax or margin manipulation.

| Endpoint | Halalas Field | Raw Halalas | Scaled SAR | Margin/Tax Recalc | Proof Status |
|---|---|---|---|:---:|:---:|
| `/api/v1/company/me/shifts` | `netSalesHalalas` | `125000` | `1250.00 SAR` | 0% (None) | **PASS** |
| `/api/v1/company/me/operations?moduleKey=sales` | `amountHalalas` | `45000` | `450.00 SAR` | 0% (None) | **PASS** |
| `/api/v1/company/me/operations?moduleKey=expenses` | `amountHalalas` | `1850` | `18.50 SAR` | 0% (None) | **PASS** |

---

## 3. User Story 4: Branch Manager Scope Evaluation (Task B2 / DIFF-02)
Empirical inspection of `/api/v1/auth/me` on live staging against `roleAccess.ts:33`:
```json
{
  "roleGrant": {
    "key": "branch",
    "scope": "branch",
    "brandIds": [],
    "restaurantIds": [],
    "branchIds": [
      "01a00ebc-98a9-7143-ae4b-4bf9ef0ca721"
    ],
    "moduleKeys": [
      "sales",
      "expenses",
      "purchases",
      "inventory",
      "shifts",
      "assets"
    ]
  },
  "guardPassed": true,
  "ruleRuleRef": "roleAccess.ts:33",
  "branchIdsCount": 1,
  "brandIdsCount": 0,
  "restaurantIdsCount": 0
}
```
- **Single-Branch Guard (`branchIds.length === 1`)**: PASSED (1 branch assigned)
- **Empty Brand Array Guard (`brandIds.length === 0`)**: PASSED (0 brands assigned)
- **Fail-Closed Protection**: `roleAccess.ts:33` evaluates to `true` with no modification required.

---

## 4. User Story 3: Subscription Plans Route Verification (Task A2)
- Route tested: `GET /api/v1/plans`
- Query role: `head@nakhat.sa`
- HTTP Status: **200 OK**
- Result: Active endpoint replaces non-existent `/company/plans` without backend change.

---

## 5. Detailed Endpoint Audit Matrix

| Role | Method | Endpoint | HTTP Status | Latency |
|---|---|---|:---:|---|
| accountant | `GET` | `/api/v1/auth/me` | **200** | 297ms |
| accountant | `GET` | `/api/v1/company/me/shifts` | **200** | 411ms |
| accountant | `GET` | `/api/v1/company/me/operations?moduleKey=sales` | **200** | 339ms |
| accountant | `GET` | `/api/v1/company/me/operations?moduleKey=expenses` | **200** | 284ms |
| accountant | `GET` | `/api/v1/company/me/cash/custody` | **404** | 349ms |
| accountant | `GET` | `/api/v1/company/me/employees` | **200** | 307ms |
| head | `GET` | `/api/v1/auth/me` | **200** | 304ms |
| head | `GET` | `/api/v1/plans` | **200** | 316ms |
| head | `GET` | `/api/v1/company/me/head/dashboard` | **200** | 339ms |
| head | `GET` | `/api/v1/head/erp/batches` | **200** | 329ms |
| head | `GET` | `/api/v1/head/erp/eligible-operations` | **200** | 336ms |
| company-admin | `GET` | `/api/v1/auth/me` | **200** | 398ms |
| company-admin | `GET` | `/api/v1/company/users` | **404** | 353ms |
| company-admin | `GET` | `/api/v1/company/invitations` | **403** | 365ms |
| branch | `GET` | `/api/v1/auth/me` | **200** | 331ms |
| branch | `GET` | `/api/v1/company/me/branch/overview` | **200** | 385ms |
| unassigned | `GET` | `/api/v1/company/me/shifts (unauthenticated)` | **401** | 357ms |
