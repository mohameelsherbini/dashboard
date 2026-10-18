import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { getHeadReviewPolicy, headLegacyBulkIds, runHeadFinalApproval } from "./headReviewGuards.ts";

const shift = { id:"shf", module:"shifts", status:"approved", reportReview:{phase:"head_review"} };
const day = { id:"day", module:"sales", workflowKind:"sal_day" as const, status:"approved", reportReview:{phase:"head_review", memberships:[{report_revision:"revision-id"}]} };
// Positive server classification establishes Legacy; null review alone does not.
const legacy = { id:"legacy", module:"sales", workflowKind:"legacy_sales" as const, status:"approved", reportReview:null };
const expectedSalPolicy = { finalApprove:true, returnForReview:false, blockedReason:null };

test("Head may attempt individual SAL final approval at row stage without claiming member or snapshot readiness", () => {
  assert.deepEqual(getHeadReviewPolicy(day,"head"), expectedSalPolicy);
  assert.equal(getHeadReviewPolicy(day,"head").finalApprove,true);
  assert.equal(getHeadReviewPolicy(day,"head").returnForReview,false);
  // Revision identifiers are not interpreted as member statuses or approval proof.
  const withRevisionOnly = {...day, reportReview:{phase:"head_review", memberships:[{report_revision:"revision-id"}]}};
  assert.deepEqual(getHeadReviewPolicy(withRevisionOnly,"head"), expectedSalPolicy);
});

test("SAL fresh detail must match operation identity, module, status and review phase", () => {
  assert.deepEqual(getHeadReviewPolicy(day,"head",{...day}), expectedSalPolicy);
  for (const detail of [
    {...day,id:"another-day"},
    {...day,module:"shifts"},
    {...day,status:"pending"},
    {...day,status:"final-approved"},
    {...day,reportReview:{phase:"accountant_review"}},
    {...day,reportReview:null},
    {...day,reportReview:"malformed"},
  ]) {
    assert.equal(getHeadReviewPolicy(day,"head",detail).finalApprove,false,JSON.stringify(detail));
    assert.equal(getHeadReviewPolicy(day,"head",detail).returnForReview,false,JSON.stringify(detail));
  }
});

test("optional identity present only in fresh detail is compatible; conflicting shared identity is denied", () => {
  const compactListRow = {...day,reportReview:{phase:"head_review"}};
  const richerDetail = {...day,reportReview:{phase:"head_review",managerShiftId:"manager-day-1"}};
  assert.deepEqual(getHeadReviewPolicy(compactListRow,"head",richerDetail),expectedSalPolicy);

  const listWithIdentity = {...day,reportReview:{phase:"head_review",managerShiftId:"manager-day-1"}};
  const detailWithConflictingIdentity = {...day,reportReview:{phase:"head_review",managerShiftId:"manager-day-2"}};
  assert.equal(getHeadReviewPolicy(listWithIdentity,"head",detailWithConflictingIdentity).finalApprove,false);
});

test("non-Head roles, denied states, malformed rows and non-head phases cannot attempt SAL final approval", () => {
  for (const role of ["accountant","branch",null,undefined]) {
    assert.equal(getHeadReviewPolicy(day,role).finalApprove,false);
    assert.equal(getHeadReviewPolicy(day,role).returnForReview,false);
  }
  for (const operation of [
    {...day,id:"",},
    {...day,status:"pending"},
    {...day,status:"rejected"},
    {...day,status:"final-approved"},
    {...day,reportReview:{phase:"accountant_review"}},
    {...day,reportReview:{phase:"head_returned"}},
    {...day,reportReview:[]},
    {...day,reportReview:"not-an-object"},
  ]) {
    assert.equal(getHeadReviewPolicy(operation,"head").finalApprove,false,JSON.stringify(operation));
    assert.equal(getHeadReviewPolicy(operation,"head").returnForReview,false,JSON.stringify(operation));
  }
  assert.deepEqual(getHeadReviewPolicy(legacy,"head"), {finalApprove:true,returnForReview:true,blockedReason:null});
});

test("existing SHF Head final-approval and return policy remains unchanged", () => {
  assert.deepEqual(getHeadReviewPolicy(shift,"head"), {finalApprove:true,returnForReview:true,blockedReason:null});
  assert.deepEqual(getHeadReviewPolicy(shift,"head",{...shift}), {finalApprove:true,returnForReview:true,blockedReason:null});
  assert.equal(getHeadReviewPolicy(shift,"head",{...shift,reportReview:{phase:"head_returned"}}).finalApprove,false);
});

test("fresh refetch refuses changed state or missing detail before mutation", async () => {
  const changed = [
    undefined,
    {...day,id:"different"},
    {...day,status:"pending"},
    {...day,module:"shifts"},
    {...day,reportReview:{phase:"accountant_review"}},
  ];
  for (const detail of changed) {
    let sends=0;
    const result=await runHeadFinalApproval(day,"head",async()=>detail,async()=>{sends++;}, {current:false});
    assert.equal(result,false);
    assert.equal(sends,0);
  }

  let identityMismatchSends=0;
  const rowWithIdentity={...day,reportReview:{phase:"head_review",managerShiftId:"listed-day"}};
  const detailWithOtherIdentity={...day,reportReview:{phase:"head_review",managerShiftId:"fresh-day"}};
  const mismatchResult=await runHeadFinalApproval(rowWithIdentity,"head",async()=>detailWithOtherIdentity,async()=>{identityMismatchSends++;}, {current:false});
  assert.equal(mismatchResult,false);
  assert.equal(identityMismatchSends,0);
});

test("fresh SAL detail permits one individual mutation", async () => {
  let loads=0,sends=0;
  const result=await runHeadFinalApproval(day,"head",async id=>{loads++;assert.equal(id,"day");return {...day};},async id=>{sends++;assert.equal(id,"day");}, {current:false});
  assert.equal(result,true);
  assert.equal(loads,1);
  assert.equal(sends,1);
});

test("403 and 409 mutation failures propagate without optimistic final success", async () => {
  for (const status of [403,409]) {
    let sends=0;
    let locallyFinal=false;
    const error=Object.assign(new Error(String(status)),{status});
    await assert.rejects(runHeadFinalApproval(day,"head",async()=>({...day}),async()=>{sends++;throw error;},{current:false}),e=>e===error);
    assert.equal(sends,1);
    assert.equal(locallyFinal,false);
  }
});

test("synchronous lock prevents duplicate SAL requests while the first is pending", async () => {
  const lock={current:false};let loads=0;const sent:string[]=[];
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const first=runHeadFinalApproval(day,"head",async()=>{loads++;return {...day};},async()=>{sent.push("day");await gate;},lock);
  assert.equal(await runHeadFinalApproval(day,"head",async()=>{loads++;return {...day};},async()=>{sent.push("duplicate");},lock),false);
  assert.equal(loads,1);
  release();
  assert.equal(await first,true);
  assert.deepEqual(sent,["day"]);
  assert.equal(lock.current,false);
});

test("SAL and SHF are excluded from all Bulk Final Approval while Legacy-only remains all-or-none", () => {
  assert.deepEqual(headLegacyBulkIds([legacy],["legacy"],"head"),["legacy"]);
  for (const ids of [["day"],["shf"],["legacy","day"],["legacy","shf"],["legacy","unknown"]]) {
    assert.deepEqual(headLegacyBulkIds([legacy,day,shift],ids,"head"),[]);
  }
  assert.deepEqual(headLegacyBulkIds([legacy],["legacy"],"accountant"),[]);
  assert.deepEqual(headLegacyBulkIds([legacy],["legacy"],"head",()=>day),[]);
  assert.deepEqual(headLegacyBulkIds([legacy],["legacy"],"head",()=>shift),[]);
});

test("existing Head screen still uses individual fresh approval and the all-or-none bulk helper", () => {
  const source=ts.createSourceFile("CompanyDashboard.tsx",readFileSync(new URL("./CompanyDashboard.tsx",import.meta.url),"utf8"),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  const component=(name:string)=>{const fn=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(fn?.body,`${name} missing`);return fn.getText(source);};
  const row=component("OpRow"),shared=component("useSharedOps"),modulePage=component("HeadModulePage"),pending=component("HeadPending");
  assert.match(row,/headPolicy\.finalApprove/);
  assert.match(row,/headPolicy\.returnForReview/);
  assert.match(shared,/runHeadFinalApproval\(operation, currentRole\.current, loadFreshDetail/);
  assert.match(shared,/actionLock\.current/);
  assert.match(pending,/headLegacyBulkIds/);
  assert.match(modulePage,/headLegacyBulkIds/);
  assert.doesNotMatch(modulePage,/awaitingHead\.forEach/);
});


test("SAL with null review and unclassified sales never enter Legacy Bulk or Return", () => {
  for (const workflowKind of ["sal_day", "unknown", undefined, "malformed"]) {
    const op = {...day,workflowKind,reportReview:null};
    assert.equal(getHeadReviewPolicy(op,"head").returnForReview,false);
    assert.equal(getHeadReviewPolicy(op,"head").finalApprove,false);
    assert.deepEqual(headLegacyBulkIds([legacy,op],[legacy.id,op.id],"head"),[]);
  }
});

test("a contradictory fresh workflow classifier blocks individual mutation", async () => {
  let sent=0;
  assert.equal(await runHeadFinalApproval(day,"head",async()=>({...day,workflowKind:"legacy_sales"}),async()=>{sent++;},{current:false}),false);
  assert.equal(sent,0);
});
