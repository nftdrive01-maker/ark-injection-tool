import { NextRequest, NextResponse } from 'next/server';
import { createDomain, createKnowledge, DUPLICATE_DOMAIN_NAME_ERROR, getAllDomains, getDomainById, updateDomain } from '@/lib/domains';
import { extractToken, verifyToken } from '@/lib/auth';
import {
  generateConversationPackage,
  type GeneratedConversationPackage,
  type GeneratedDomainDraft,
  type GeneratedKnowledgeDraft,
} from '@/lib/conversation-domain-generator';

type GenerationMode = 'knowledge-only' | 'attach-domain' | 'create-domain';
type GenerationAction = 'preview' | 'create';

function sanitizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function sanitizeThemeColor(value: unknown): string {
  if (typeof value !== 'string') {
    return '#2563eb';
  }

  const trimmed = value.trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return '#2563eb';
  }

  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function normalizeDraft(input: unknown, fallback?: GeneratedConversationPackage): GeneratedConversationPackage | null {
  if (!input || typeof input !== 'object') {
    return fallback || null;
  }

  const payload = input as Record<string, unknown>;
  const knowledgeRaw = payload.knowledge && typeof payload.knowledge === 'object'
    ? payload.knowledge as Record<string, unknown>
    : {};
  const domainRaw = payload.domain && typeof payload.domain === 'object'
    ? payload.domain as Record<string, unknown>
    : {};

  const provider = payload.provider === 'openai' ? 'openai' : fallback?.provider || 'ollama';
  const model = sanitizeText(payload.model, fallback?.model || 'unknown');

  const knowledge: GeneratedKnowledgeDraft = {
    name: sanitizeText(knowledgeRaw.name, fallback?.knowledge.name || '会話生成ナレッジ'),
    description: sanitizeText(knowledgeRaw.description, fallback?.knowledge.description || ''),
    systemPrompt: sanitizeText(knowledgeRaw.systemPrompt, fallback?.knowledge.systemPrompt || ''),
    context: sanitizeText(knowledgeRaw.context, fallback?.knowledge.context || ''),
    priority: typeof knowledgeRaw.priority === 'number' && Number.isFinite(knowledgeRaw.priority)
      ? Math.max(1, Math.min(999, Math.floor(knowledgeRaw.priority)))
      : (fallback?.knowledge.priority || 90),
  };

  const domain: GeneratedDomainDraft = {
    name: sanitizeText(domainRaw.name, fallback?.domain.name || `${knowledge.name}コンシェルジュ`),
    description: sanitizeText(domainRaw.description, fallback?.domain.description || ''),
    characterName: sanitizeText(domainRaw.characterName, fallback?.domain.characterName || ''),
    baseSystemPrompt: sanitizeText(domainRaw.baseSystemPrompt, fallback?.domain.baseSystemPrompt || ''),
    baseContext: sanitizeText(domainRaw.baseContext, fallback?.domain.baseContext || ''),
    themeColor: sanitizeThemeColor(domainRaw.themeColor ?? fallback?.domain.themeColor),
  };

  return { knowledge, domain, provider, model };
}

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

function resolveUniqueDomainName(baseName: string): string {
  const existing = new Set(getAllDomains().map((domain) => domain.name.trim().toLocaleLowerCase()));
  const trimmed = baseName.trim() || '会話生成ドメイン';
  if (!existing.has(trimmed.toLocaleLowerCase())) {
    return trimmed;
  }

  let suffix = 2;
  let candidate = `${trimmed} ${suffix}`;
  while (existing.has(candidate.toLocaleLowerCase())) {
    suffix += 1;
    candidate = `${trimmed} ${suffix}`;
  }

  return candidate;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action: GenerationAction = body?.action === 'preview' ? 'preview' : 'create';
    const conversation = typeof body?.conversation === 'string' ? body.conversation.trim() : '';
    const mode: GenerationMode = body?.mode === 'attach-domain' || body?.mode === 'create-domain'
      ? body.mode
      : 'knowledge-only';
    const attachDomainId = typeof body?.attachDomainId === 'string' ? body.attachDomainId.trim() : '';
    const knowledgeNameHint = typeof body?.knowledgeNameHint === 'string' ? body.knowledgeNameHint.trim() : '';
    const domainNameHint = typeof body?.domainNameHint === 'string' ? body.domainNameHint.trim() : '';
    const templateLabel = typeof body?.templateLabel === 'string' ? body.templateLabel.trim() : '';
    const templateInstructions = typeof body?.templateInstructions === 'string' ? body.templateInstructions.trim() : '';

    if (conversation.length < 20) {
      return NextResponse.json({ error: '会話テキストをもう少し詳しく入力してください' }, { status: 400 });
    }

    if (mode === 'attach-domain' && !attachDomainId) {
      return NextResponse.json({ error: 'アタッチ先ドメインを選択してください' }, { status: 400 });
    }

    const generated = await generateConversationPackage({
      conversation,
      mode,
      knowledgeNameHint,
      domainNameHint,
      templateLabel,
      templateInstructions,
    });

    if (action === 'preview') {
      return NextResponse.json({
        success: true,
        preview: generated,
        generator: {
          provider: generated.provider,
          model: generated.model,
        },
      });
    }

    const draft = normalizeDraft(body?.draft, generated);
    if (!draft) {
      return NextResponse.json({ error: '保存用ドラフトの生成に失敗しました' }, { status: 400 });
    }

    const knowledge = createKnowledge({
      name: draft.knowledge.name,
      description: draft.knowledge.description,
      systemPrompt: draft.knowledge.systemPrompt,
      context: draft.knowledge.context,
      enabled: true,
      priority: draft.knowledge.priority,
    });

    let domain = null;

    if (mode === 'attach-domain') {
      const current = getDomainById(attachDomainId);
      if (!current) {
        return NextResponse.json({ error: 'アタッチ先ドメインが見つかりません' }, { status: 404 });
      }

      const nextKnowledgeIds = current.knowledgeIds.includes(knowledge.id)
        ? current.knowledgeIds
        : [...current.knowledgeIds, knowledge.id];
      domain = updateDomain(current.id, { knowledgeIds: nextKnowledgeIds });
    }

    if (mode === 'create-domain') {
      const uniqueName = resolveUniqueDomainName(draft.domain.name);
      domain = createDomain({
        name: uniqueName,
        description: draft.domain.description,
        sharedLogEnabled: true,
        baseSystemPrompt: draft.domain.baseSystemPrompt,
        baseContext: draft.domain.baseContext,
        themeColor: draft.domain.themeColor,
        characterName: draft.domain.characterName,
        vrmEnabled: false,
        knowledgeIds: [knowledge.id],
      });
    }

    return NextResponse.json({
      success: true,
      knowledge,
      domain,
      generator: {
        provider: draft.provider,
        model: draft.model,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === DUPLICATE_DOMAIN_NAME_ERROR) {
      return NextResponse.json({ error: '同じ名前のドメインは登録できません' }, { status: 409 });
    }

    console.error('Generate from conversation error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '会話からの生成に失敗しました',
    }, { status: 500 });
  }
}