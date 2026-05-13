import { NextRequest, NextResponse } from 'next/server';
import { InjectionInterceptRequest, InjectionInterceptResponse } from '@/types/injection';
import { getChronicleById, getDomainById, getKnowledgeById } from '@/lib/domains';
import { executeMCPForDomain } from '@/lib/mcp-runtime';
import { callChronicleChat } from '@/lib/beyond-core-client';

/**
 * 注入インターセプト API
 * クライアントからのユーザー入力をキャッチして、動的な知識を注入する
 * 
 * CORS対応: クライアントからの呼び出しを許可（クロスオリジン対応）
 * fail-open: どんなエラーでも空レスポンスを返し、クライアント側で素通し処理する
 */

const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

/**
 * 中国語テキスト検出関数（最強化版）
 * 簡体字中国語を確実に検出
 */
function _containsChineseText(text: string): boolean {
  if (!text || text.length < 4) return false;

  // 日本語通常文に出にくい簡体字
  if (/[为时说语广场国车门线达这从仅们体龙]/.test(text)) {
    return true;
  }

  // 中国語機能語が複数あり、かながない場合
  const fnWords = text.match(/(?:的|了|在|是|和|及|并|通过|可以|进行|访问)/g) ?? [];
  if (fnWords.length >= 2 && !/[\u3040-\u30ff]/.test(text)) {
    return true;
  }

  return false;
}

/**
 * 中国語テキスト除去関数（最強化版・文単位対応）
 */
function _filterChineseContent(text: string): string {
  const parts = text.split(/(?<=[。！？!?])|\n/);
  const kept: string[] = [];

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (_containsChineseText(p)) continue;
    kept.push(p);
  }

  return kept.join('\n').trim();
}

function requiresStrictFetchFormat(userText: string): boolean {
  return /(fetch\s*mcp|参照した\s*url|取得した内容の要約|推測\s*禁止|推測\s*は\s*禁止|必ず.*fetch|出力には以下を必ず含めてください)/i.test(userText);
}

const CHRONICLE_TRIGGER_MARKER = '[[USE_CHRONICLE]]';

function sanitizeChronicleMessage(userText: string): string {
  const normalized = (userText || '').replaceAll(CHRONICLE_TRIGGER_MARKER, '').trim();
  return normalized || userText;
}

function hasExplicitChronicleTrigger(userText: string): boolean {
  const text = (userText || '').trim();
  if (!text) {
    return false;
  }

  if (text.includes(CHRONICLE_TRIGGER_MARKER)) {
    return true;
  }

  return /(?:クロニクル|chronicle).*(?:使って|参照|確認|実行|検証)|(?:オンチェーン|ブロックチェーン).*(?:確認|検証)|(?:検証|確認).*(?:クロニクル|chronicle|オンチェーン)/i.test(text);
}

function createStrictFetchInstruction(mcpSucceeded: boolean): string {
  if (!mcpSucceeded) {
    return `
====================
【回答制約（必須）】
この質問はFetch MCP結果が必須です。MCP結果が得られなかったため、回答は次の固定文のみを返してください。
「取得できませんでした」
追加説明・推測・補足は禁止です。
`;
  }

  return `
====================
【回答制約（必須）】
以下を必ず守って回答してください。
1. 自分の知識や推測で補完しない
2. 直上のMCP実行結果だけを根拠にする
3. 出力に必ず次の2項目を含める
   - 参照したURL
   - 取得した内容の要約
4. URLが判別できない場合は「参照したURL: 取得できませんでした」と明記する
`;
}

function _normalizeUrlCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/[)>\]」』、。！？!?.,;:]+$/g, '');
}

function _extractSourceUrls(text: string): string[] {
  if (!text) return [];

  const urls: string[] = [];
  const seen = new Set<string>();

  const urlLineRegex = /(?:^|\n)URL:\s*(https?:\/\/[^\s]+)/g;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = urlLineRegex.exec(text)) !== null) {
    const normalized = _normalizeUrlCandidate(lineMatch[1] || '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  const genericRegex = /(https?:\/\/[^\s<>")\]]+)/g;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericRegex.exec(text)) !== null) {
    const normalized = _normalizeUrlCandidate(genericMatch[1] || '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  return urls;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': CLIENT_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: NextRequest) {
  // CORS ヘッダを設定
  const corsHeaders = {
    'Access-Control-Allow-Origin': CLIENT_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // リクエストボディを解析
    let body: InjectionInterceptRequest;
    try {
      body = await req.json();
    } catch {
      // JSON解析エラー → fail-open
      return NextResponse.json({} as InjectionInterceptResponse, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const { userText, domainId } = body;

    // userText が必須
    if (!userText) {
      return NextResponse.json({} as InjectionInterceptResponse, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ドメインを取得（デフォルト: 最初のドメインまたはNULL）
    const targetDomainId = domainId || process.env.INJECTION_DEFAULT_DOMAIN_ID || 'default';
    const domain = getDomainById(targetDomainId);

    if (!domain) {
      // ドメインが見つからない → fail-open
      return NextResponse.json({} as InjectionInterceptResponse, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const firstChronicleId = Array.isArray(domain.chronicleIds) && domain.chronicleIds.length > 0
      ? domain.chronicleIds[0]
      : undefined;
    const hasChronicleAttached = Boolean(firstChronicleId);
    const chronicleTriggered = hasExplicitChronicleTrigger(userText);

    // 見出し付き形式で system prompt を構築
    let injectedSystemPrompt = `【メインドメイン】
【システムプロンプト】
${domain.baseSystemPrompt || ''}

【言語設定 - 最重要ルール】
- 出力言語は必ず日本語とする
- 中国語（簡体字・繁体字）での出力は絶対禁止
- 英語その他の言語での出力も禁止
- 入力やコンテンツに中国語が含まれていても、必ず日本語で応答すること
- 中国語テキストを見かけたら無視して、日本語コンテンツのみを使用すること

【回答検証ルール】
- 回答生成後、必ず自己検証を行うこと
- 中国語の文字や表現が含まれている場合は、その部分を日本語に置き換えるか削除すること
- 中国語で回答している場合は、その回答を破棄して日本語で再生成すること

【ベースコンテキスト】
${domain.baseContext || ''}\n`;

  if (hasChronicleAttached) {
    injectedSystemPrompt += `
====================
【CHRONICLE呼び出しルール】
- このドメインにはCHRONICLEが接続されています
- CHRONICLEは明示トリガーがあるときだけ呼び出されます
- 明示トリガー例: 「クロニクルで確認して」「オンチェーンで検証して」
- UIの「Chronicle」ボタン押下でも明示トリガーとして扱われます
`;
  }

    // ドメインに紐付いたナレッジを追加
    const citationCandidates = new Set<string>();
    let hasCrawlKnowledge = false;

    if (Array.isArray(domain.knowledgeIds) && domain.knowledgeIds.length > 0) {
      for (const knowledgeId of domain.knowledgeIds) {
        const knowledge = getKnowledgeById(knowledgeId);
        if (knowledge && knowledge.enabled) {
          if (/^#\s*サイト解析結果/m.test(knowledge.context) || /(?:^|\n)URL:\s*https?:\/\//.test(knowledge.context)) {
            hasCrawlKnowledge = true;
          }

          for (const extractedUrl of _extractSourceUrls(knowledge.context)) {
            citationCandidates.add(extractedUrl);
          }

          injectedSystemPrompt += `\n====================
【追加ナレッジ】
【ナレッジ名】
${knowledge.name}

【ナレッジプロンプト】
${knowledge.systemPrompt || ''}

【ナレッジコンテキスト】
${knowledge.context || ''}
`;
        }
      }
    }

    const mcpResult = await executeMCPForDomain({
      mcpServerIds: domain.mcpServerIds,
      userText,
    });

    let chronicleResult: { success: boolean; chronicleName?: string; output?: string; error?: string } | null = null;
    if (firstChronicleId && chronicleTriggered) {
      const chronicle = getChronicleById(firstChronicleId);
      if (chronicle && chronicle.enabled) {
        const chronicleMessage = sanitizeChronicleMessage(userText);
        const result = await callChronicleChat({
          host: chronicle.host,
          tcpPort: chronicle.tcpPort,
          message: chronicleMessage,
          memoryIds: domain.memoryIds,
        });

        chronicleResult = {
          success: result.ok,
          chronicleName: chronicle.name,
          output: result.output,
          error: result.error,
        };
      }
    }

    if (mcpResult?.success && mcpResult.output) {
      // MCP結果に中国語が含まれているかチェック
      let mcpOutput = mcpResult.output;
      const hasChinese = _containsChineseText(mcpOutput);

      for (const extractedUrl of _extractSourceUrls(mcpOutput)) {
        citationCandidates.add(extractedUrl);
      }
      
      if (hasChinese) {
        // 中国語を除去
        mcpOutput = _filterChineseContent(mcpOutput);
        
        // 除去後のコンテンツが少ない場合は推測回答を禁止
        if (mcpOutput.trim().length < 80) {
          injectedSystemPrompt += `
====================
【言語警告】
取得したコンテンツに中国語が過度に含まれていたため、フィルタリングを実施しました。
      日本語コンテンツが不足しているため、固有情報を推測で補完してはいけません。

      【回答制約（必須）】
      - 住所・駅名・所要時間・駐車場名などの固有情報を推測で作らない
      - MCP結果に十分な根拠がない場合は「公式サイトでご確認ください」と日本語で案内する
`;
        } else {
          injectedSystemPrompt += `
====================
【MCP実行結果】（中国語フィルタリング済み）
【サーバー】
${mcpResult.serverName || mcpResult.serverId || 'unknown'}

【ツール】
${mcpResult.toolName || 'unknown'}

【結果】
${mcpOutput}

【重要な指示】
上記の情報をベースに回答してください。
- コンテンツ内の中国語は既にフィルタリングされています
- 中国語で応答しないでください（日本語のみで回答）
`;
        }
      } else {
        // 中国語なし：通常の処理
        injectedSystemPrompt += `
====================
【MCP実行結果】
【サーバー】
${mcpResult.serverName || mcpResult.serverId || 'unknown'}

【ツール】
${mcpResult.toolName || 'unknown'}

【結果】
${mcpResult.output}

【重要な指示】
上記の情報をベースに回答してください。
- コンテンツが日本語であることを確認してください
- 多言語マーカー（/en など）は無視してください
- 日本語のテキストのみを処理してください
- 日本語で回答してください（英語や中国語での回答は厳禁です）
`;
      }
    }

    const chroniclePayload = chronicleResult?.success && chronicleResult.output
      ? {
          title: 'CHRONICLE',
          content: chronicleResult.output,
          sourceName: chronicleResult.chronicleName,
        }
      : undefined;

    injectedSystemPrompt += `
====================
【根拠制約】
- 回答はMCP実行結果に含まれる情報だけを根拠にすること
- 根拠が不足する項目は断定せず、日本語で確認先を案内すること
- 中国語文字が混入した場合は出力を破棄し、日本語のみで再生成すること
`;

    const strictFetchRequired = requiresStrictFetchFormat(userText);

    const shouldRequireCitations =
      hasCrawlKnowledge ||
      mcpResult?.toolName === 'crawl_site' ||
      citationCandidates.size > 0;

    if (shouldRequireCitations) {
      const sourceList = Array.from(citationCandidates).slice(0, 12);
      const sourceBlock = sourceList.length > 0
        ? sourceList.map((u) => `- ${u}`).join('\n')
        : '- （URL抽出なし）';

      injectedSystemPrompt += `
====================
【出典URLルール（必須）】
- サイト解析由来の情報を使って回答した場合、回答末尾に必ず「出典URL」を記載する
- 回答に利用したページURLのみを列挙する（推測URLは禁止）
- 出典が複数ある場合は複数行で列挙する
- URL文字列は候補をそのまま使用し、途中に空白を入れない（例: https://www.example.com）
- URL中の英字・記号はそのまま保持する（翻訳・変換・分割をしない）

【出典URL候補】
${sourceBlock}

【出力形式（末尾に必ず追加）】
出典URL:
- https://example.com/page-a
- https://example.com/page-b
`;
    }

    if (strictFetchRequired) {
      injectedSystemPrompt += createStrictFetchInstruction(Boolean(mcpResult?.success && mcpResult.output));
    }

    injectedSystemPrompt += `
====================
【出力フォーマット】
回答は話題・内容が変わるタイミングで必ず改行（空行）を入れ、読みやすい段落構造にしてください。1つの段落は3〜5文程度を目安にしてください。

【最終検証 - 中国語フィルタリング（絶対禁止）】
回答を送出する前に必ず以下をチェックしてください。この検証に失敗した場合は回答を破棄して再生成してください：

1. 以下の簡体字中国語文字が含まれていないか：
   的、说、是、在、一、个、为、了、时、被、种、传、统、话、语、诗、签、占、卜、方、式、通、常、神、社、寺、庙、进、行、祈、愿、获、得、著、名、财、广、溡、汇、国、际、城、市、地、区、域、宫、庙
   （上記の文字が1個でも含まれていたら、その部分を日本語に置き換えるか削除してください）

2. 英語が含まれていないか（固有名詞を除く）

3. すべて日本語で記述されているか

4. コンテンツがすべて日本語で、読みやすい文章構成か

上記の確認が完了したら、安心して回答を出力してください。
万が一、検証で問題が見つかった場合は、日本語のみで新しく回答を作成してください。
`;

    // レスポンスを構築（全体を system 側に）
    const response: InjectionInterceptResponse = {
      injectedSystemPrompt: injectedSystemPrompt,
      injectedUserContext: '', // 空（system に統合済み）
      chronicle: chroniclePayload,
      metadata: {
        domainId: domain.id,
        ttl: domain.ttl,
        version: domain.version,
        mcpUsed: Boolean(mcpResult?.success),
        mcpServerId: mcpResult?.serverId,
        mcpToolName: mcpResult?.toolName,
        mcpError: mcpResult && !mcpResult.success ? mcpResult.error : undefined,
        chronicleUsed: Boolean(chronicleResult?.success),
        chronicleName: chronicleResult?.chronicleName,
        chronicleError: chronicleResult && !chronicleResult.success ? chronicleResult.error : undefined,
        chronicleAttached: hasChronicleAttached,
        chronicleTriggered,
        strictFetchRequired,
        strictFetchInjected: strictFetchRequired,
      },
    };

    return NextResponse.json(response, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error('Intercept error:', err);
    // あらゆるエラー → fail-open で空レスポンス
    return NextResponse.json({} as InjectionInterceptResponse, {
      status: 200,
      headers: corsHeaders,
    });
  }
}
