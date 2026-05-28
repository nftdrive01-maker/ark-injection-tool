type StyleBertVits2FetchResult = {
  response: Response;
  sourceBaseUrl: string;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '');
}

function toHostDockerInternalVariant(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== 'sbv2') {
      return null;
    }

    parsed.hostname = 'host.docker.internal';
    return normalizeBaseUrl(parsed.toString());
  } catch {
    return null;
  }
}

export function getStyleBertVits2BaseUrlCandidates(): string[] {
  const rawCandidates = [
    process.env.INJECTION_STYLEBERTVITS2_URL,
    process.env.STYLEBERTVITS2_URL,
    process.env.NEXT_PUBLIC_STYLEBERTVITS2_SERVER_URL,
    'http://127.0.0.1:5000',
    'http://host.docker.internal:5000',
    'http://sbv2:5000',
  ];

  const candidates: string[] = [];
  for (const rawCandidate of rawCandidates) {
    if (typeof rawCandidate !== 'string' || !rawCandidate.trim()) {
      continue;
    }

    const normalized = normalizeBaseUrl(rawCandidate.trim());
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }

    const fallback = toHostDockerInternalVariant(normalized);
    if (fallback && !candidates.includes(fallback)) {
      candidates.push(fallback);
    }
  }

  return candidates;
}

export async function fetchStyleBertVits2Upstream(
  pathWithQuery: string,
  init?: RequestInit,
): Promise<StyleBertVits2FetchResult> {
  const candidates = getStyleBertVits2BaseUrlCandidates();
  const errors: string[] = [];

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${pathWithQuery}`, init);
      return {
        response,
        sourceBaseUrl: baseUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${baseUrl}: ${message}`);
    }
  }

  throw new Error(errors.length > 0 ? errors.join(' | ') : 'SBV2 upstream is unavailable');
}