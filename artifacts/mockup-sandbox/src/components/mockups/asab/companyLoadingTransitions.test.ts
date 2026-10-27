import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React, { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { canRoleCreateBrandOrRestaurant } from "./companyAdminGuards.ts";

const dashboardPath = fileURLToPath(new URL("CompanyDashboard.tsx", import.meta.url));
const sourceText = readFileSync(dashboardPath, "utf8");
const sourceFile = ts.createSourceFile(
  "CompanyDashboard.tsx",
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

const companyAdminPath = fileURLToPath(new URL("../../../api/queries/companyAdmin.ts", import.meta.url));
const companyAdminText = readFileSync(companyAdminPath, "utf8");

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getFunctionDeclaration(name: string): ts.FunctionDeclaration | undefined {
  let target: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      target = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return target;
}

function transpileFunction(fnNode: ts.FunctionDeclaration): string {
  const code = fnNode.getText(sourceFile);
  return ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.None,
    },
  }).outputText;
}

const HOOK_NAMES = new Set([
  "useState",
  "useEffect",
  "useContext",
  "useReducer",
  "useCallback",
  "useMemo",
  "useRef",
  "useImperativeHandle",
  "useLayoutEffect",
  "useDebugValue",
  "useTransition",
  "useDeferredValue",
  "useId",
  "useSyncExternalStore",
  "useInsertionEffect",
]);

function isHookCall(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    if (ts.isIdentifier(expr) && (expr.text.startsWith("use") || HOOK_NAMES.has(expr.text))) {
      return true;
    }
    if (ts.isPropertyAccessExpression(expr) && expr.name.text.startsWith("use")) {
      return true;
    }
  }
  return false;
}

function analyzeComponentHookOrdering(fnNode: ts.FunctionDeclaration) {
  const body = fnNode.body;
  assert.ok(body, `${fnNode.name?.text} must have a function body`);

  const hookCalls: { name: string; line: number }[] = [];
  const earlyReturns: { line: number; condition: string }[] = [];
  const hooksAfterEarlyReturn: { name: string; line: number; afterReturnLine: number }[] = [];

  function scan(node: ts.Node, insideConditional: boolean = false) {
    if (isHookCall(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const text = node.getText(sourceFile);
      const hookName = text.split("(")[0].trim();
      hookCalls.push({ name: hookName, line });

      if (earlyReturns.length > 0) {
        hooksAfterEarlyReturn.push({
          name: hookName,
          line,
          afterReturnLine: earlyReturns[0].line,
        });
      }

      if (insideConditional) {
        assert.fail(
          `React Rules of Hooks violation: Hook '${hookName}' is called inside a conditional block at line ${line}`
        );
      }
    }

    if (ts.isIfStatement(node)) {
      let hasReturn = false;
      function checkReturn(n: ts.Node) {
        if (ts.isReturnStatement(n)) hasReturn = true;
        ts.forEachChild(n, checkReturn);
      }
      checkReturn(node.thenStatement);

      if (hasReturn) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const condText = node.expression.getText(sourceFile);
        earlyReturns.push({ line, condition: condText });
      }

      scan(node.expression, true);
      scan(node.thenStatement, true);
      if (node.elseStatement) {
        scan(node.elseStatement, true);
      }
      return;
    }

    ts.forEachChild(node, (n) => scan(n, insideConditional));
  }

  scan(body, false);

  return {
    hookCalls,
    earlyReturns,
    hooksAfterEarlyReturn,
  };
}

// Mock UI Primitives for React runtime rendering
const MockIcon = (props: any) => React.createElement("svg", props);
const MockBadge = ({ children, className }: any) => React.createElement("span", { className }, children);
const MockBtn = ({ children, onClick, disabled, variant }: any) =>
  React.createElement("button", { onClick, disabled, className: variant }, children);
const MockKpiCard = ({ label, value, sub }: any) =>
  React.createElement("div", { "data-kpi": label }, value, sub);

// ─── Tests ───────────────────────────────────────────────────────────────────

test("W1-B (R03): CAUsers declares all hooks above early loading/error returns", () => {
  const fn = getFunctionDeclaration("CAUsers");
  assert.ok(fn, "CAUsers function must exist in CompanyDashboard.tsx");

  const analysis = analyzeComponentHookOrdering(fn);

  assert.ok(analysis.hookCalls.length >= 8, `CAUsers should have at least 8 hooks, found ${analysis.hookCalls.length}`);
  assert.ok(analysis.earlyReturns.length >= 2, `CAUsers should have at least 2 early returns (loading & error)`);
  assert.equal(
    analysis.hooksAfterEarlyReturn.length,
    0,
    `CAUsers must have 0 hooks after early returns. Violations: ${JSON.stringify(analysis.hooksAfterEarlyReturn)}`
  );
});

test("W1-B (R03): CABranches declares all hooks above early loading/error returns", () => {
  const fn = getFunctionDeclaration("CABranches");
  assert.ok(fn, "CABranches function must exist in CompanyDashboard.tsx");

  const analysis = analyzeComponentHookOrdering(fn);

  assert.ok(analysis.hookCalls.length >= 6, `CABranches should have at least 6 hooks, found ${analysis.hookCalls.length}`);
  assert.ok(analysis.earlyReturns.length >= 2, `CABranches should have at least 2 early returns (loading & error)`);
  assert.equal(
    analysis.hooksAfterEarlyReturn.length,
    0,
    `CABranches must have 0 hooks after early returns. Violations: ${JSON.stringify(analysis.hooksAfterEarlyReturn)}`
  );
});

test("W1-B (R03): Component Lifecycle state transitions maintain constant hook order and count", () => {
  const fnUsers = getFunctionDeclaration("CAUsers");
  assert.ok(fnUsers);
  const analysisUsers = analyzeComponentHookOrdering(fnUsers);

  const hookSequence = analysisUsers.hookCalls.map(h => h.name);
  assert.ok(hookSequence.includes("useCLang"), "Must initialize language hook");
  assert.ok(hookSequence.includes("useCompanyUsers"), "Must initialize company users query");
  assert.ok(hookSequence.includes("useCompanyInvitations"), "Must initialize company invitations query");
  assert.ok(hookSequence.includes("useState"), "Must initialize controlled state hooks");

  const loadingPhaseHookCount = analysisUsers.hookCalls.filter(h => h.line < analysisUsers.earlyReturns[0].line).length;
  const totalHookCount = analysisUsers.hookCalls.length;
  assert.equal(
    loadingPhaseHookCount,
    totalHookCount,
    "All hooks must execute during the loading phase to prevent React hook order mismatch"
  );
});

test("W1-B (R03): Real React runtime execution of CABranches across full lifecycle (Loading -> Error -> Retry -> Loaded)", () => {
  const fnBranches = getFunctionDeclaration("CABranches");
  assert.ok(fnBranches);
  const js = transpileFunction(fnBranches);

  let queryBrandsState: any = { data: [], isLoading: true, isError: false, error: null };
  let queryUsersState: any = { data: [] };

  const Component = new Function(
    "React", "useState", "useCLang", "useCompanyBrands", "useCompanyUsers",
    "useCreateBranch", "useTransferBranchManager", "getErrorMessage", "validateBranchCreate",
    "fmt", "KpiCard", "Btn", "Badge",
    "RefreshCw", "AlertTriangle", "Plus", "X", "ArrowLeftRight", "ChevronDown",
    "Star", "Home", "Building2", "TrendingUp",
    `${js}\nreturn CABranches;`
  )(
    React,
    useState,
    () => ({ t: (ar: string, en?: string) => ar, dir: "rtl", lang: "ar" }),
    () => ({ ...queryBrandsState, refetch: () => { queryBrandsState = { data: [], isLoading: true, isError: false, error: null }; } }),
    () => queryUsersState,
    () => ({ mutate: () => {}, isPending: false }),
    () => ({ mutate: () => {}, isPending: false }),
    (err: any) => err?.message || "Failed to fetch branches",
    () => ({ valid: true }),
    (n: number) => String(n),
    MockKpiCard,
    MockBtn,
    MockBadge,
    MockIcon, MockIcon, MockIcon, MockIcon, MockIcon, MockIcon,
    MockIcon, MockIcon, MockIcon, MockIcon
  );

  const render = () => renderToStaticMarkup(React.createElement(Component));

  // 1. Loading state
  queryBrandsState = { data: [], isLoading: true, isError: false, error: null };
  const loadingHtml = render();
  assert.match(loadingHtml, /جارٍ تحميل العلامات والفروع/, "Must render loading message");
  assert.ok(!loadingHtml.includes("Error"), "Loading state must not show error");

  // 2. Error state
  queryBrandsState = { data: [], isLoading: false, isError: true, error: new Error("Backend connection lost") };
  const errorHtml = render();
  assert.match(errorHtml, /فشل تحميل الفروع والعلامات/, "Must render error alert");
  assert.match(errorHtml, /Backend connection lost/, "Must display actual error message");
  assert.match(errorHtml, /إعادة المحاولة/, "Must render retry button");

  // 3. Retry -> Loading state
  queryBrandsState = { data: [], isLoading: true, isError: false, error: null };
  const retryLoadingHtml = render();
  assert.match(retryLoadingHtml, /جارٍ تحميل العلامات والفروع/, "Must re-enter loading state smoothly");

  // 4. Loaded state (with real brand/restaurant/branch tree)
  queryBrandsState = {
    data: [
      {
        id: "b-01",
        name: "برجر العرب",
        abbr: "BA",
        color: "#7C3AED",
        restaurants: [
          {
            id: "r-01",
            name: "مطعم السليمانية",
            branches: [
              { id: "br-01", name: "فرع التحلية", city: "الرياض", mgr: "سعد الخالدي", salesM: 120000, target: 150000 },
            ],
          },
        ],
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
  };
  const loadedHtml = render();
  assert.match(loadedHtml, /العلامات التجارية والفروع/, "Must render branches title");
  assert.match(loadedHtml, /برجر العرب/, "Must render brand name");
  assert.match(loadedHtml, /1 مطاعم · 1 فروع/, "Must render restaurant and branch summary");
  assert.match(loadedHtml, /إضافة فرع/, "Must preserve Add Branch entry point");

  // DB-R04: Confirm no Add Brand or Add Restaurant buttons appear
  assert.ok(!loadedHtml.includes("إضافة علامة"), "Loaded HTML must not contain Add Brand");
  assert.ok(!loadedHtml.includes("إضافة مطعم"), "Loaded HTML must not contain Add Restaurant");

  // 5. Repeated rerenders across transitions without hook order error
  for (let i = 0; i < 10; i++) {
    queryBrandsState = i % 2 === 0
      ? { data: [], isLoading: true, isError: false, error: null }
      : { data: [{ id: `b-${i}`, name: `Brand ${i}`, restaurants: [] }], isLoading: false, isError: false, error: null };
    const html = render();
    assert.ok(html.length > 50, "Every rerender must produce valid non-blank HTML");
  }
});

test("W1-B (R03): Real React runtime execution of CAUsers across full lifecycle (Loading -> Error -> Retry -> Loaded)", () => {
  const fnUsers = getFunctionDeclaration("CAUsers");
  assert.ok(fnUsers);
  const js = transpileFunction(fnUsers);

  let queryUsersState: any = { data: [], isLoading: true, isError: false, error: null };
  let queryInvitesState: any = { data: [], isLoading: false, isError: false, error: null };

  const Component = new Function(
    "React", "useState", "useCLang", "useCompanyUsers", "useCompanyInvitations",
    "useCreateCompanyInvitation", "useResendCompanyInvitation", "useRevokeCompanyInvitation",
    "useToggleCompanyUserStatus", "useUpdateCompanyUser", "useLookup", "getErrorMessage",
    "ROLE_AR", "Btn", "Badge",
    "Search", "Send", "Users", "Lock", "Edit2", "Shield", "Mail", "Phone",
    "Check", "X", "RefreshCw", "AlertTriangle", "Plus",
    `${js}\nreturn CAUsers;`
  )(
    React,
    useState,
    () => ({ t: (ar: string, en?: string) => ar, dir: "rtl", lang: "ar" }),
    () => ({ ...queryUsersState, refetch: () => { queryUsersState = { data: [], isLoading: true, isError: false, error: null }; } }),
    () => ({ ...queryInvitesState, refetch: () => {} }),
    () => ({ mutate: () => {}, isPending: false }),
    () => ({ mutate: () => {}, isPending: false }),
    () => ({ mutate: () => {}, isPending: false }),
    () => ({ mutate: () => {}, isPending: false }),
    () => ({ mutate: () => {}, isPending: false }),
    () => ({ data: [] }),
    (err: any) => err?.message || "Failed to fetch users",
    { "company-admin": "مدير الشركة", "head": "رئيس الحسابات", "accountant": "محاسب", "branch": "مدير فرع", "procurement": "مدير مشتريات" },
    MockBtn,
    MockBadge,
    MockIcon, MockIcon, MockIcon, MockIcon, MockIcon, MockIcon, MockIcon, MockIcon,
    MockIcon, MockIcon, MockIcon, MockIcon, MockIcon
  );

  const render = () => renderToStaticMarkup(React.createElement(Component));

  // 1. Loading state
  queryUsersState = { data: [], isLoading: true, isError: false, error: null };
  const loadingHtml = render();
  assert.match(loadingHtml, /جارٍ تحميل المستخدمين والدعوات/, "Must render loading message");

  // 2. Error state
  queryUsersState = { data: [], isLoading: false, isError: true, error: new Error("Unauthorized tenant access") };
  const errorHtml = render();
  assert.match(errorHtml, /فشل تحميل قائمة المستخدمين/, "Must render error alert");
  assert.match(errorHtml, /Unauthorized tenant access/, "Must render error message");
  assert.match(errorHtml, /إعادة المحاولة/, "Must render retry button");

  // 3. Retry -> Loading state
  queryUsersState = { data: [], isLoading: true, isError: false, error: null };
  const retryHtml = render();
  assert.match(retryHtml, /جارٍ تحميل المستخدمين والدعوات/, "Must re-enter loading state smoothly");

  // 4. Loaded state
  queryUsersState = {
    data: [
      { id: "u-01", name: "خالد المحاسب", roleKey: "accountant", roleLabel: "محاسب", branchName: "فرع العليا", email: "khaled@assab.com", status: "active", lastActiveAt: "2026-10-27" },
    ],
    isLoading: false,
    isError: false,
    error: null,
  };
  queryInvitesState = {
    data: [
      { id: "inv-01", email: "invitee@assab.com", roleKey: "branch", status: "pending", expiresAt: "2026-11-01" },
    ],
    isLoading: false,
    isError: false,
    error: null,
  };
  const loadedHtml = render();
  assert.match(loadedHtml, /إدارة المستخدمين/, "Must render user management header");
  assert.match(loadedHtml, /خالد المحاسب/, "Must render user name");
  assert.match(loadedHtml, /invitee@assab\.com/, "Must render pending invitation");

  // 5. Repeated rerenders across transitions without hook order error
  for (let i = 0; i < 10; i++) {
    queryUsersState = i % 2 === 0
      ? { data: [], isLoading: true, isError: false, error: null }
      : { data: [{ id: `u-${i}`, name: `User ${i}`, roleKey: "accountant", status: "active" }], isLoading: false, isError: false, error: null };
    const html = render();
    assert.ok(html.length > 50, "Every rerender must produce valid non-blank HTML");
  }
});

// ─── W1-C / DB-R04: Company Admin Brand & Restaurant Creation Prohibition ─────

test("W1-C (DB-R04): Role guard permits ONLY Platform Admin and forbids Company Admin", () => {
  assert.equal(canRoleCreateBrandOrRestaurant("admin"), true, "Platform Admin (admin) must be allowed");
  assert.equal(canRoleCreateBrandOrRestaurant("platform-admin"), true, "Platform Admin alias must be allowed");
  assert.equal(canRoleCreateBrandOrRestaurant("super-admin"), true, "Super Admin must be allowed");

  // Forbidden roles
  assert.equal(canRoleCreateBrandOrRestaurant("company-admin"), false, "Company Admin must be forbidden");
  assert.equal(canRoleCreateBrandOrRestaurant("head"), false, "Head Accountant must be forbidden");
  assert.equal(canRoleCreateBrandOrRestaurant("accountant"), false, "Accountant must be forbidden");
  assert.equal(canRoleCreateBrandOrRestaurant("branch"), false, "Branch Manager must be forbidden");
  assert.equal(canRoleCreateBrandOrRestaurant("procurement"), false, "Procurement Manager must be forbidden");
  assert.equal(canRoleCreateBrandOrRestaurant(""), false, "Empty role must be forbidden");
});

test("W1-C (DB-R04): CABranches UI contains NO Add Brand or Add Restaurant creation entry points", () => {
  const fn = getFunctionDeclaration("CABranches");
  assert.ok(fn);
  const text = fn.getText(sourceFile);

  // Verify buttons are removed
  assert.ok(!text.includes("إضافة علامة"), "CABranches must not contain 'إضافة علامة' button");
  assert.ok(!text.includes("Add Brand"), "CABranches must not contain 'Add Brand' button");
  assert.ok(!text.includes("إضافة مطعم"), "CABranches must not contain 'إضافة مطعم' button");
  assert.ok(!text.includes("Add Restaurant"), "CABranches must not contain 'Add Restaurant' button");

  // Verify modal state is removed
  assert.ok(!text.includes("showAddBrand"), "CABranches must not contain showAddBrand modal state");
  assert.ok(!text.includes("showAddRestaurant"), "CABranches must not contain showAddRestaurant modal state");

  // Verify mutation hooks are removed from CABranches
  assert.ok(!text.includes("useCreateBrand"), "CABranches must not call useCreateBrand");
  assert.ok(!text.includes("useCreateRestaurant"), "CABranches must not call useCreateRestaurant");

  // Verify legitimate Branch request workflow is preserved
  assert.ok(text.includes("useCreateBranch"), "CABranches must preserve useCreateBranch");
  assert.ok(text.includes("إضافة فرع") || text.includes("Add Branch"), "CABranches must preserve Add Branch entry point");
  assert.ok(text.includes("useTransferBranchManager"), "CABranches must preserve manager transfer workflow");
});

test("W1-C (DB-R04): companyAdmin.ts contains NO active or dead Company Admin brand/restaurant creation hooks", () => {
  assert.ok(!companyAdminText.includes("export function useCreateBrand"), "companyAdmin.ts must not export useCreateBrand");
  assert.ok(!companyAdminText.includes("export function useCreateRestaurant"), "companyAdmin.ts must not export useCreateRestaurant");
});
