import { prisma } from "@/lib/prisma";
import { HOME_TEAM_SLUG } from "@/lib/brand";
import { decryptSecret } from "@/lib/crypto";
import { callProvider, DEFAULT_MODELS, AiProviderError, type AiProvider } from "./providers";

// The single entry point every AI feature goes through: resolves the team's
// provider/key/model, enforces the on/off switch and daily limit, calls the
// provider and logs usage (AiUsage) whether it worked or not.

export class AiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type TeamAiConfig = {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string | null;
  dailyLimit: number;
  hasAnthropicKey: boolean;
  hasOpenAiKey: boolean;
};

/** The team's AI settings with the key decrypted. Server-side only. */
export async function getTeamAiConfig(teamId: string): Promise<TeamAiConfig> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true, settings: true } });
  const s = team?.settings;
  const provider: AiProvider = s?.aiProvider === "OPENAI" ? "OPENAI" : "ANTHROPIC";
  const anthropicKey = s?.anthropicKeyEnc ? decryptSecret(s.anthropicKeyEnc) : null;
  const openaiKey = s?.openaiKeyEnc ? decryptSecret(s.openaiKeyEnc) : null;
  // The deployment's own env keys only ever serve the home team — other
  // teams bring their own key (same rule as notifications).
  const isHome = team?.slug === HOME_TEAM_SLUG;
  const envKey = isHome ? (provider === "OPENAI" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY) : undefined;
  const apiKey = (provider === "OPENAI" ? openaiKey : anthropicKey) ?? envKey ?? null;
  return {
    enabled: !!s?.aiEnabled,
    provider,
    model: (provider === "OPENAI" ? s?.openaiModel : s?.anthropicModel) || DEFAULT_MODELS[provider],
    apiKey,
    dailyLimit: s?.aiDailyLimit ?? 200,
    hasAnthropicKey: !!anthropicKey || (isHome && !!process.env.ANTHROPIC_API_KEY),
    hasOpenAiKey: !!openaiKey || (isHome && !!process.env.OPENAI_API_KEY),
  };
}

export async function isAiReady(teamId: string) {
  const c = await getTeamAiConfig(teamId);
  return c.enabled && !!c.apiKey;
}

export async function runAi(input: {
  teamId: string;
  userId: string;
  feature: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Bypass the on/off switch (used by the Settings "Test" button). */
  allowDisabled?: boolean;
}) {
  const config = await getTeamAiConfig(input.teamId);
  if (!config.enabled && !input.allowDisabled) throw new AiError("AI is turned off for this team. An admin can enable it in Settings → AI.", 403);
  if (!config.apiKey) throw new AiError(`No ${config.provider === "OPENAI" ? "OpenAI" : "Anthropic"} API key saved. Add one in Settings → AI.`, 403);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.aiUsage.count({ where: { teamId: input.teamId, createdAt: { gte: since } } });
  if (used >= config.dailyLimit) throw new AiError(`Daily AI limit reached (${config.dailyLimit} calls in 24h). An admin can raise it in Settings → AI.`, 429);

  const base = { teamId: input.teamId, userId: input.userId, feature: input.feature, provider: config.provider, model: config.model };
  try {
    const result = await callProvider(config.provider, {
      apiKey: config.apiKey,
      model: config.model,
      system: input.system,
      prompt: input.prompt,
      maxTokens: input.maxTokens ?? 1500,
    });
    await prisma.aiUsage.create({ data: { ...base, ok: true, inputTokens: result.inputTokens, outputTokens: result.outputTokens } });
    if (!result.text.trim()) throw new AiError("The AI returned an empty answer. Try again.", 502);
    return { ...result, provider: config.provider, model: config.model };
  } catch (err: any) {
    if (err instanceof AiError) throw err;
    await prisma.aiUsage.create({ data: { ...base, ok: false, error: String(err?.message ?? err).slice(0, 500) } });
    if (err instanceof AiProviderError) throw new AiError(err.message, 502);
    throw new AiError("The AI request failed. Try again.", 502);
  }
}
