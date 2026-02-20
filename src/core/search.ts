export type SearchHit = {
  kind: "command" | "doc";
  title: string;
  ref: string;
  snippet: string;
  score: number;
  source: "local" | "mcp";
  category?: string;
  filename?: string;
};

export function rankSearchHits(query: string, hits: SearchHit[], limit: number): SearchHit[] {
  const normalizedQuery = normalize(query);
  const tokens = tokenize(normalizedQuery);

  const scored = hits
    .map((hit) => ({
      hit,
      score: computeScore(tokens, normalizedQuery, `${hit.title}\n${hit.ref}\n${hit.snippet}`)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.hit.title.localeCompare(b.hit.title);
    })
    .slice(0, limit)
    .map((item) => ({
      ...item.hit,
      score: item.score
    }));

  return scored;
}

function computeScore(tokens: string[], normalizedQuery: string, haystackRaw: string): number {
  const haystack = normalize(haystackRaw);

  let score = 0;
  if (normalizedQuery.length > 0 && haystack.includes(normalizedQuery)) {
    score += 5;
  }

  for (const token of tokens) {
    if (token.length < 2) {
      continue;
    }

    if (haystack.includes(token)) {
      score += 2;
    }
  }

  return score;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKC");
}

function tokenize(value: string): string[] {
  return value
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}
