import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";
import { getErrorMessage } from "../api/errors";
import { formatHalalas } from "../api/money";
import { useCompanyPlans, type Plan } from "../api/queries/companyAdmin";

type Step = 1 | 2 | 3;

interface Props {
  onDone: () => void;
}

interface OnboardForm {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  selectedPlanId: string | null;
}

const initialForm: OnboardForm = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  selectedPlanId: null,
};

export function OnboardingWizard({ onDone }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<OnboardForm>(initialForm);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  const { data: plans, isLoading: plansLoading, isError: plansError } =
    useCompanyPlans();

  const submitMut = useMutation({
    mutationFn: async () => {
      const res = await api.post("/company/onboard", {
        companyName: form.companyName,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        planId: form.selectedPlanId,
        billingCycle: cycle,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("تم إنشاء الحساب — افحص بريدك لتفعيله ثم سجل الدخول");
      onDone();
    },
    onError: (e) => toast.error(getErrorMessage(e, "ar")),
  });

  function next() {
    if (step === 1) {
      if (!form.selectedPlanId) {
        toast.error("اختر باقة للمتابعة");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!form.companyName || !form.contactName || !form.email) {
        toast.error("أكمل بيانات الشركة وجهة الاتصال");
        return;
      }
      setStep(3);
      return;
    }
  }

  function back() {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 3) {
      submitMut.mutate();
    } else {
      next();
    }
  }

  const selectedPlan = plans?.find((p) => p.id === form.selectedPlanId) ?? null;

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg, #0A1628 0%, #0F1C35 40%, #1B3A6B 100%)",
        fontFamily:
          "'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: step === 1 ? 880 : 480,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(124,58,237,0.25)",
          borderRadius: 20,
          padding: "36px 32px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Brand + Stepper */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, #7C3AED, #00D9FF)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 900,
              color: "white",
            }}
          >
            ع
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: "white",
                lineHeight: 1,
              }}
            >
              عصب{" "}
              <span style={{ color: "#00D9FF", fontFamily: "system-ui" }}>
                ASAB
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
              أنشئ حساب شركتك في 3 خطوات
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginBottom: 24,
          }}
        >
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                width: 64,
                height: 4,
                borderRadius: 2,
                background:
                  s <= step
                    ? "linear-gradient(135deg, #7C3AED, #00D9FF)"
                    : "rgba(255,255,255,0.08)",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        <h1
          style={{
            fontSize: 18,
            color: "white",
            fontWeight: 700,
            margin: "0 0 4px",
            textAlign: "center",
          }}
        >
          {step === 1 && "اختر الباقة المناسبة"}
          {step === 2 && "بيانات الشركة وجهة الاتصال"}
          {step === 3 && "مراجعة وتأكيد"}
        </h1>
        <p
          style={{
            fontSize: 12,
            color: "#94a3b8",
            margin: "0 0 24px",
            textAlign: "center",
          }}
        >
          {step === 1 && "ابدأ بأي باقة، يمكنك الترقية لاحقاً من لوحة التحكم"}
          {step === 2 && "هنرسلك إيميل تفعيل بعد إنشاء الحساب"}
          {step === 3 && "تأكد من البيانات قبل الإرسال"}
        </p>

        {/* ── STEP 1: Plans ──────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            {/* Cycle toggle */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                background: "rgba(255,255,255,0.04)",
                padding: 4,
                borderRadius: 10,
                width: "fit-content",
                margin: "0 auto 18px",
              }}
            >
              {(["monthly", "annual"] as const).map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCycle(c)}
                  style={{
                    padding: "8px 18px",
                    background:
                      cycle === c
                        ? "linear-gradient(135deg, #7C3AED, #00D9FF)"
                        : "transparent",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {c === "monthly" ? "شهري" : "سنوي"}
                </button>
              ))}
            </div>

            {plansLoading && (
              <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 24 }}>
                جاري تحميل الباقات…
              </div>
            )}
            {plansError && (
              <div style={{ textAlign: "center", color: "#ef4444", fontSize: 13, padding: 24 }}>
                تعذّر تحميل الباقات
              </div>
            )}

            {plans && plans.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                  marginBottom: 24,
                }}
              >
                {plans.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    cycle={cycle}
                    selected={form.selectedPlanId === p.id}
                    onSelect={() =>
                      setForm((f) => ({ ...f, selectedPlanId: p.id }))
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── STEP 2: Details form ───────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Field
              label="اسم الشركة"
              value={form.companyName}
              onChange={(v) => setForm((f) => ({ ...f, companyName: v }))}
              required
              autoFocus
            />
            <Field
              label="اسم جهة الاتصال"
              value={form.contactName}
              onChange={(v) => setForm((f) => ({ ...f, contactName: v }))}
              required
            />
            <Field
              label="البريد الإلكتروني"
              type="email"
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              required
              dir="ltr"
            />
            <Field
              label="رقم الهاتف"
              type="tel"
              value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              dir="ltr"
            />
          </>
        )}

        {/* ── STEP 3: Review ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: 18,
              marginBottom: 22,
            }}
          >
            <ReviewRow label="الشركة" value={form.companyName} />
            <ReviewRow label="جهة الاتصال" value={form.contactName} />
            <ReviewRow label="البريد" value={form.email} />
            {form.phone && <ReviewRow label="الهاتف" value={form.phone} />}
            <ReviewRow
              label="الباقة"
              value={
                selectedPlan
                  ? `${selectedPlan.nameAr ?? selectedPlan.name} · ${cycle === "monthly" ? "شهري" : "سنوي"}`
                  : "—"
              }
            />
            <ReviewRow
              label="السعر"
              value={
                selectedPlan
                  ? formatHalalas(
                      cycle === "monthly"
                        ? selectedPlan.priceMonthlyHalalas
                        : selectedPlan.priceAnnualHalalas,
                      "ar",
                    )
                  : "—"
              }
            />
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: "flex", gap: 10 }}>
          {step > 1 && (
            <button
              type="button"
              onClick={back}
              disabled={submitMut.isPending}
              style={{
                flex: 1,
                padding: "13px",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: submitMut.isPending ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              رجوع
            </button>
          )}
          <button
            type="submit"
            disabled={submitMut.isPending || (step === 1 && plansLoading)}
            style={{
              flex: 2,
              padding: "13px",
              background:
                submitMut.isPending
                  ? "rgba(124,58,237,0.5)"
                  : "linear-gradient(135deg, #7C3AED, #00D9FF)",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: submitMut.isPending ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {step === 3
              ? submitMut.isPending
                ? "جاري الإنشاء…"
                : "إنشاء الحساب"
              : "متابعة"}
          </button>
        </div>

        <button
          type="button"
          onClick={onDone}
          disabled={submitMut.isPending}
          style={{
            display: "block",
            width: "100%",
            background: "transparent",
            border: "none",
            color: "#94a3b8",
            fontSize: 12,
            cursor: submitMut.isPending ? "wait" : "pointer",
            marginTop: 14,
            fontFamily: "inherit",
          }}
        >
          عندي حساب بالفعل — رجوع لتسجيل الدخول
        </button>
      </form>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function PlanCard({
  plan,
  cycle,
  selected,
  onSelect,
}: {
  plan: Plan;
  cycle: "monthly" | "annual";
  selected: boolean;
  onSelect: () => void;
}) {
  const price =
    cycle === "monthly" ? plan.priceMonthlyHalalas : plan.priceAnnualHalalas;
  const features =
    (plan.featuresAr && plan.featuresAr.length > 0
      ? plan.featuresAr
      : plan.features) ?? [];
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        background: selected ? "rgba(124,58,237,0.10)" : "rgba(255,255,255,0.04)",
        border: selected
          ? "2px solid #7C3AED"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: 18,
        textAlign: "right",
        cursor: "pointer",
        color: "white",
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
        {plan.nameAr ?? plan.name}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 900,
          color: "#00D9FF",
          marginBottom: 2,
        }}
      >
        {price != null ? formatHalalas(price, "ar") : "—"}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 12 }}>
        / {cycle === "monthly" ? "شهرياً" : "سنوياً"}
      </div>
      {features.slice(0, 5).map((f, i) => (
        <div
          key={i}
          style={{
            fontSize: 11,
            color: "#cbd5e1",
            marginBottom: 4,
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span style={{ color: "#00D9FF" }}>✓</span>
          <span>{typeof f === "string" ? f : ((f as any)?.labelAr || (f as any)?.labelEn || "")}</span>
        </div>
      ))}
      {plan.maxBranches != null && (
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8 }}>
          حتى {plan.maxBranches} فرع
        </div>
      )}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  autoFocus = false,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  dir?: "ltr" | "rtl";
}) {
  return (
    <>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: "#cbd5e1",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "white",
          fontSize: 14,
          marginBottom: 18,
          outline: "none",
          direction: dir ?? "rtl",
          textAlign: "right",
          fontFamily: "inherit",
        }}
      />
    </>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: 13, color: "white", fontWeight: 600 }}>
        {value || "—"}
      </span>
    </div>
  );
}
