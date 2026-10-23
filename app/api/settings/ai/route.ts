import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { AiError, runAi } from "@/lib/ai/client";

// Team AI settings. API keys are write-only: they're encrypted on save and
// never returned — the page only learns whether one is set.

const schema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(["ANTHROPIC", "OPENAI"]).optional(),
  // undefined = keep, "" = remove, otherwise the new key.
  anthropicKey: z.string().max(400).optional(),
  openaiKey: z.string().max(400).optional(),
  anthropicModel: z.string().max(100).optional(),
  openaiModel: z.string().max(100).optional(),
  dailyLimit: z.number().int().min(1).max(5000).optional(),
});

async function requireAdmin() {
  const user = await getCurrentUserOrNull();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!permissions.canManageNotificationSettings(user.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;
  const keyField = (v: string | undefined) => (v === undefined ? undefined : v.trim() ? encryptSecret(v.trim()) : null);
  const data = {
    ...(d.enabled !== undefined ? { aiEnabled: d.enabled } : {}),
    ...(d.provider ? { aiProvider: d.provider } : {}),
    ...(d.anthropicKey !== undefined ? { anthropicKeyEnc: keyField(d.anthropicKey) } : {}),
    ...(d.openaiKey !== undefined ? { openaiKeyEnc: keyField(d.openaiKey) } : {}),
    ...(d.anthropicModel !== undefined ? { anthropicModel: d.anthropicModel.trim() || null } : {}),
    ...(d.openaiModel !== undefined ? { openaiModel: d.openaiModel.trim() || null } : {}),
    ...(d.dailyLimit !== undefined ? { aiDailyLimit: d.dailyLimit } : {}),
  };
  await prisma.teamSettings.upsert({ where: { teamId: auth.user.teamId }, update: data, create: { teamId: auth.user.teamId, ...data } });
  return NextResponse.json({ ok: true });
}

// "Test connection" — a tiny real call with the saved provider/key/model.
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const result = await runAi({
      teamId: auth.user.teamId,
      userId: auth.user.id,
      feature: "settings-test",
      system: "You are a connection test.",
      prompt: "Reply with exactly: OK",
      maxTokens: 10,
      allowDisabled: true,
    });
    return NextResponse.json({ ok: true, provider: result.provider, model: result.model, reply: result.text.trim().slice(0, 40) });
  } catch (err) {
    if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Test failed." }, { status: 500 });
  }
}
