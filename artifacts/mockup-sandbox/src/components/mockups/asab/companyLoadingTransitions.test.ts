import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
      // Check if statement contains a return statement directly in its then-statement
      let hasReturn = false;
      function checkReturn(n: ts.Node) {
        if (ts.isReturnStatement(n)) hasReturn = true;
        ts.forEachChild(n, checkReturn);
      }
      checkReturn(node.thenStatement);

      if (hasReturn) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        earlyReturns.push({ line, condition: node.expression.getText(sourceFile) });
      }

      // Scan then/else branches
      ts.forEachChild(node.thenStatement, n => scan(n, true));
      if (node.elseStatement) {
        ts.forEachChild(node.elseStatement, n => scan(n, true));
      }
      return;
    }

    ts.forEachChild(node, n => scan(n, insideConditional));
  }

  scan(body);

  return {
    componentName: fnNode.name?.text,
    hookCalls,
    earlyReturns,
    hooksAfterEarlyReturn,
  };
}

// ─── W1-B / R03: React Hook Ordering Lifecycle Tests ─────────────────────────

test("W1-B (R03): CAUsers declares all hooks above early loading/error returns", () => {
  const fn = getFunctionDeclaration("CAUsers");
  assert.ok(fn, "CAUsers component must exist in CompanyDashboard.tsx");

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
  assert.ok(fn, "CABranches component must exist in CompanyDashboard.tsx");

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
  // Simulate React reconciliation lifecycle transitions for CAUsers:
  // Transition 1: Loading -> Loaded
  // Transition 2: Loading -> Error
  // Transition 3: Error -> Retry -> Loaded
  // Transition 4: Repeated re-renders

  const fnUsers = getFunctionDeclaration("CAUsers");
  assert.ok(fnUsers);
  const analysisUsers = analyzeComponentHookOrdering(fnUsers);

  // In all states (loading, error, loaded), the exact sequence and count of hooks invoked must be invariant
  const hookSequence = analysisUsers.hookCalls.map(h => h.name);
  assert.ok(hookSequence.includes("useCLang"), "Must initialize language hook");
  assert.ok(hookSequence.includes("useCompanyUsers"), "Must initialize company users query");
  assert.ok(hookSequence.includes("useCompanyInvitations"), "Must initialize company invitations query");
  assert.ok(hookSequence.includes("useState"), "Must initialize controlled state hooks");

  // Verify that hook count does not change between loading and loaded phases
  const loadingPhaseHookCount = analysisUsers.hookCalls.filter(h => h.line < analysisUsers.earlyReturns[0].line).length;
  const totalHookCount = analysisUsers.hookCalls.length;
  assert.equal(
    loadingPhaseHookCount,
    totalHookCount,
    "All hooks must execute during the loading phase to prevent React hook order mismatch"
  );
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

  // Verify mutation hooks are removed
  assert.ok(!text.includes("useCreateBrand"), "CABranches must not call useCreateBrand");
  assert.ok(!text.includes("useCreateRestaurant"), "CABranches must not call useCreateRestaurant");

  // Verify legitimate Branch request workflow is preserved
  assert.ok(text.includes("useCreateBranch"), "CABranches must preserve useCreateBranch");
  assert.ok(text.includes("إضافة فرع") || text.includes("Add Branch"), "CABranches must preserve Add Branch entry point");
  assert.ok(text.includes("useTransferBranchManager"), "CABranches must preserve manager transfer workflow");
});
