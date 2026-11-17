const MOODLE_ORIGIN = "https://aulavirtual.unsa.edu.pe";
const CLASSROOM_ORIGIN = "https://classroom.google.com";
const WEB_LINK = /https:\/\/[^\s<>"\[\]]+/gi;
const LINK_TRAILING_PUNCTUATION = /[.,;!?)]+$/;
const MOODLE_REFERENCES = /\r?\n\s*Links:\s*\r?\n-{2,}\s*\r?\n((?:\[\d+\]\s*https:\/\/[^\s]+\s*)+)$/i;

function secureUrl(value: string): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (Array.from(url.searchParams.keys()).some((key) => key.toLowerCase() === "authtoken")) return null;
    if (url.origin === MOODLE_ORIGIN && url.pathname.endsWith("/calendar/export_execute.php")) return null;
    return url;
  } catch {
    return null;
  }
}

export function getTaskDetailLinks(
  origin: string,
  alternateLink: string | null | undefined,
  description: string | null | undefined
): { text: string; assignmentUrl: string | null; resources: { url: URL; reference?: string }[] } {
  const isMoodle = origin === "dutic" || origin === "moodle";
  const platformOrigin = isMoodle ? MOODLE_ORIGIN : origin === "classroom" ? CLASSROOM_ORIGIN : null;
  function isTaskLink(url: URL): boolean {
    if (url.origin !== platformOrigin) return false;
    if (!isMoodle) return /^(?:\/u\/\d+)?\/c\//.test(url.pathname);
    return /\/mod\/[a-z][a-z0-9_]*\/view\.php$/.test(url.pathname)
      && /^[1-9]\d*$/.test(url.searchParams.get("id") ?? "");
  }

  const stored = secureUrl(alternateLink?.trim() ?? "");
  const body = description?.trim() ?? "";
  const footer = isMoodle ? body.match(MOODLE_REFERENCES) : null;
  const references = new Map<string, string>();
  for (const [, reference, value] of Array.from((footer?.[1] ?? "").matchAll(/\[(\d+)\]\s*(https:\/\/[^\s]+)/gi))) {
    const url = secureUrl(value.replace(LINK_TRAILING_PUNCTUATION, ""));
    if (url) references.set(url.href, reference);
  }

  const links = new Map<string, URL>();
  for (const [value] of Array.from(body.matchAll(WEB_LINK))) {
    const url = secureUrl(value.replace(LINK_TRAILING_PUNCTUATION, ""));
    if (url) links.set(url.href, url);
  }

  const candidates = Array.from(links.values()).filter(isTaskLink);
  const assignmentUrl = stored && (isTaskLink(stored) || (stored.origin === CLASSROOM_ORIGIN && origin === "classroom"))
    ? stored.href
    : candidates.length === 1 ? candidates[0].href : null;
  if (assignmentUrl) links.delete(assignmentUrl);

  // Moodle's text export appends numbered references after the actual instructions.
  const instructions = footer ? body.slice(0, footer.index) : body;
  const text = instructions.replace(WEB_LINK, (value) => {
    const link = value.replace(LINK_TRAILING_PUNCTUATION, "");
    const url = secureUrl(link);
    return url ? url.hostname + value.slice(link.length) : "";
  }).trim();
  return { text, assignmentUrl, resources: Array.from(links.values()).map((url) => ({ url, reference: references.get(url.href) })) };
}
