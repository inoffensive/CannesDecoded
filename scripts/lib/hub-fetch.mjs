/**
 * Shared HTTP fetch with retries for Love The Work hub scrapers.
 */

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; CannesDecoded/1.0; +https://github.com/inoffensive/CannesDecoded)";

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchHubPage(url, options = {}) {
  const maxRetries = options.maxRetries ?? 4;
  const userAgent = options.userAgent ?? DEFAULT_UA;
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (res.status >= 500 && attempt < maxRetries) {
          await sleep(1000 * attempt);
          continue;
        }
        throw lastErr;
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}
