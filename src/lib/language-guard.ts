const SIMPLIFIED_HINT_CHARS = /[为时说语广场国车门线达这从仅们体龙]/;
const CHINESE_FUNCTION_WORDS = /(?:的|了|在|是|和|及|并|通过|可以|进行|访问|您|我们|你们)/;

export function containsLikelyChinese(text: string): boolean {
  if (!text || text.trim().length < 4) return false;
  if (SIMPLIFIED_HINT_CHARS.test(text)) return true;

  const fn = text.match(CHINESE_FUNCTION_WORDS);
  if (fn && !/[\u3040-\u30ff]/.test(text)) {
    return true;
  }
  return false;
}

export function sanitizeCrawlResult(raw: string): { cleaned: string; removedChunks: number } {
  if (!raw) {
    return { cleaned: '', removedChunks: 0 };
  }

  const chunks = raw.split(/(?<=[。！？!?])|\n/);
  let removed = 0;
  const kept: string[] = [];

  for (const chunk of chunks) {
    const c = chunk.trim();
    if (!c) continue;

    // Remove language switcher / menu boilerplate that tends to pollute prompts.
    if (/^(English|中文|Language|言語選択|MENU|Scroll)$/i.test(c)) {
      removed += 1;
      continue;
    }

    if (containsLikelyChinese(c)) {
      removed += 1;
      continue;
    }

    kept.push(c);
  }

  return {
    cleaned: kept.join('\n').trim(),
    removedChunks: removed,
  };
}
