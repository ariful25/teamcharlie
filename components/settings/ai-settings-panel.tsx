"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";

type Props = {
  enabled: boolean;
  provider: "ANTHROPIC" | "OPENAI";
  anthropicModel: string;
  openaiModel: string;
  defaultModels: { ANTHROPIC: string; OPENAI: string };
  hasAnthropicKey: boolean;
  hasOpenAiKey: boolean;
  dailyLimit: number;
  usage: { calls: number; failed: number; inputTokens: number; outputTokens: number; byFeature: { feature: string; calls: number }[] };
};

const FEATURE_LABEL: Record<string, string> = {
  "listing-insights": "Listing insights",
  "checkin-guide": "Check-in guide",
  "listing-copy": "Title & description",
  "review-reply": "Review replies",
  "settings-test": "Connection tests",
};

/** Settings → AI: provider, keys (write-only), model, on/off, daily limit, usage. */
export function AiSettingsPanel(props: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(props.enabled);
  const [provider, setProvider] = useState(props.provider);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState(props.anthropicModel);
  const [openaiModel, setOpenaiModel] = useState(props.openaiModel);
  const [dailyLimit, setDailyLimit] = useState(String(props.dailyLimit));
  const [busy, setBusy] = useState<string | null>(null);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy("save");
    const res = await fetch("/api/settings/ai", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        provider,
        anthropicModel,
        openaiModel,
        dailyLimit: Number(dailyLimit),
        ...(anthropicKey ? { anthropicKey } : {}),
        ...(openaiKey ? { openaiKey } : {}),
        ...extra,
      }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not save");
      return false;
    }
    setAnthropicKey("");
    setOpenaiKey("");
    toast.success("AI settings saved");
    router.refresh();
    return true;
  }

  async function test() {
    if (!(await save())) return;
    setBusy("test");
    const res = await fetch("/api/settings/ai", { method: "POST" });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast.success(`Connected to ${data.provider === "OPENAI" ? "OpenAI" : "Anthropic"} (${data.model})`);
    else toast.error(data.error ?? "Connection test failed");
  }

  const keySet = provider === "OPENAI" ? props.hasOpenAiKey : props.hasAnthropicKey;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Powers the AI tools in Listing Health (insights, check-in guide, title &amp; description ideas, review replies). Uses your
        own API key — usage is billed by the provider to your account. Door codes and Wi-Fi passwords are never sent to the AI.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
        <span className="flex items-center gap-2">
          {enabled && keySet ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
          {enabled && keySet ? "AI is on" : !keySet ? "No API key for the selected provider yet" : "AI is off"}
        </span>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable AI features
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <Select
            value={provider}
            onValueChange={(v) => setProvider(v as Props["provider"])}
            options={[
              { value: "ANTHROPIC", label: "Anthropic (Claude)" },
              { value: "OPENAI", label: "OpenAI (GPT)" },
            ]}
          />
        </Field>
        <Field label="Daily limit (calls per 24h)">
          <input type="number" min={1} max={5000} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-medium">Anthropic</p>
          <Field label={props.hasAnthropicKey ? "API key (saved — enter to replace)" : "API key"}>
            <input type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-…" className={inputClass} autoComplete="off" />
          </Field>
          <Field label="Model">
            <input value={anthropicModel} onChange={(e) => setAnthropicModel(e.target.value)} placeholder={props.defaultModels.ANTHROPIC} className={inputClass} />
          </Field>
          {props.hasAnthropicKey && (
            <button type="button" className="text-xs text-danger hover:underline" onClick={() => save({ anthropicKey: "" })}>
              Remove saved key
            </button>
          )}
        </div>
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-medium">OpenAI</p>
          <Field label={props.hasOpenAiKey ? "API key (saved — enter to replace)" : "API key"}>
            <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-…" className={inputClass} autoComplete="off" />
          </Field>
          <Field label="Model">
            <input value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} placeholder={props.defaultModels.OPENAI} className={inputClass} />
          </Field>
          {props.hasOpenAiKey && (
            <button type="button" className="text-xs text-danger hover:underline" onClick={() => save({ openaiKey: "" })}>
              Remove saved key
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={!!busy} onClick={test}>
          {busy === "test" ? "Testing…" : "Save & test connection"}
        </Button>
        <Button disabled={!!busy} onClick={() => save()}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="rounded-xl border border-border p-3">
        <p className="font-medium">Last 30 days</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {props.usage.calls} calls ({props.usage.failed} failed) · {props.usage.inputTokens.toLocaleString()} input +{" "}
          {props.usage.outputTokens.toLocaleString()} output tokens
        </p>
        {props.usage.byFeature.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {props.usage.byFeature.map((f) => `${FEATURE_LABEL[f.feature] ?? f.feature}: ${f.calls}`).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
