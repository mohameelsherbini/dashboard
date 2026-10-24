import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("T020: Enforce Rule ASSET-01 - Zero depreciation calculations or KPIs in CompanyDashboard.tsx", () => {
  const filePath = new URL("./CompanyDashboard.tsx", import.meta.url);
  const content = readFileSync(filePath, "utf8");

  // 1. Zero totalDep calculation or usage
  assert.equal(
    content.includes("totalDep"),
    false,
    "CompanyDashboard.tsx must not calculate or reference totalDep",
  );

  // 2. Zero 'الاستهلاك السنوي' or 'الاستهلاك الشهري'
  assert.equal(
    content.includes("الاستهلاك السنوي"),
    false,
    "CompanyDashboard.tsx must not display 'الاستهلاك السنوي'",
  );
  assert.equal(
    content.includes("الاستهلاك الشهري"),
    false,
    "CompanyDashboard.tsx must not display 'الاستهلاك الشهري'",
  );

  // 3. Zero 'الاستهلاك' or 'Depr.' labels in asset draft summary
  assert.equal(
    content.includes('t("الاستهلاك","Depr.")'),
    false,
    "CompanyDashboard.tsx must not display asset draft depreciation label",
  );

  // 4. Zero depreciation division formulas across all variable patterns (e.g. d.amount/(d.usefulLife/12) or cost/usefulLife)
  const deprFormulaRegex = /\/\s*\(?\s*(?:[a-zA-Z0-9_]+\.)?usefulLife/i;
  assert.equal(
    deprFormulaRegex.test(content),
    false,
    "CompanyDashboard.tsx must not contain any division by usefulLife formula",
  );

  // 5. Status retired must be labeled 'مستبعد' instead of 'مُهلك'
  assert.equal(
    content.includes('retired:"مُهلك"'),
    false,
    "retired status must not be labeled 'مُهلك'",
  );
  assert.ok(
    content.includes('retired:"مستبعد"'),
    "retired status must be labeled 'مستبعد'",
  );

  // 6. Disclaimer note on useful life field
  assert.ok(
    content.includes("لا يُستخدم لحساب إهلاك"),
    "Useful life field must contain explicit disclaimer 'لا يُستخدم لحساب إهلاك'",
  );
});

test("T020: Enforce Rule ASSET-01 - Zero depreciation calculations and mandatory disclaimer in AccAssets.tsx", () => {
  const filePath = new URL("./_pages/accountant/AccAssets.tsx", import.meta.url);
  const content = readFileSync(filePath, "utf8");

  // 1. Must contain explicit disclaimer note on useful life
  assert.ok(
    content.includes("لا يُستخدم لحساب إهلاك"),
    "AccAssets.tsx must contain explicit disclaimer 'لا يُستخدم لحساب إهلاك' on useful life",
  );

  // 2. Zero depreciation division formulas
  const deprFormulaRegex = /\/\s*\(?\s*(?:[a-zA-Z0-9_]+\.)?usefulLife\b/i;
  assert.equal(
    deprFormulaRegex.test(content),
    false,
    "AccAssets.tsx must not contain any division by usefulLife formula",
  );

  // 3. Zero 'الاستهلاك السنوي' or 'الاستهلاك الشهري'
  assert.equal(
    content.includes("الاستهلاك السنوي"),
    false,
    "AccAssets.tsx must not display 'الاستهلاك السنوي'",
  );
  assert.equal(
    content.includes("الاستهلاك الشهري"),
    false,
    "AccAssets.tsx must not display 'الاستهلاك الشهري'",
  );
});

test("T020: Enforce Halala Financial Display Precision in CompanyDashboard.tsx", () => {
  const filePath = new URL("./CompanyDashboard.tsx", import.meta.url);
  const content = readFileSync(filePath, "utf8");

  // 1. Zero Math.round wrapping bookValueHalalas
  assert.equal(
    /Math\.round\s*\([^)]*bookValueHalalas/i.test(content),
    false,
    "CompanyDashboard.tsx must not round bookValueHalalas to whole Riyal with Math.round",
  );

  // 2. Both asset displays must preserve halalas using fmtAmt with fixed 2 decimal places
  assert.ok(
    content.includes("fmtAmt((a.bookValueHalalas ?? 0) / 100)"),
    "CompanyDashboard.tsx must format bookValueHalalas with fmtAmt preserving minimumFractionDigits: 2",
  );

  // 3. Halala precision test (D-3): test 12.00, 12.50, and 123.45 SAR
  const formatSarEn = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatSarAr = (n: number) => n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Case 1: 1200 halalas = 12.00 SAR
  const sar1 = 1200 / 100;
  assert.equal(sar1, 12);
  assert.equal(formatSarEn(sar1), "12.00", "12.00 SAR must display two trailing zero fraction digits");
  assert.equal(formatSarAr(sar1), "١٢٫٠٠", "12.00 SAR must format with two fraction digits in Arabic locale");

  // Case 2: 1250 halalas = 12.50 SAR
  const sar2 = 1250 / 100;
  assert.equal(sar2, 12.5);
  assert.equal(formatSarEn(sar2), "12.50", "12.50 SAR must display trailing zero as 12.50");
  assert.equal(formatSarAr(sar2), "١٢٫٥٠", "12.50 SAR must format as ١٢٫٥٠ in Arabic locale");

  // Case 3: 12345 halalas = 123.45 SAR
  const sar3 = 12345 / 100;
  assert.equal(sar3, 123.45);
  assert.equal(formatSarEn(sar3), "123.45", "123.45 SAR must preserve exact halalas");
  assert.equal(formatSarAr(sar3), "١٢٣٫٤٥", "123.45 SAR must format as ١٢٣٫٤٥ in Arabic locale");
});
