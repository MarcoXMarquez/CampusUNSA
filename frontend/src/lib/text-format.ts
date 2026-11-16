const SPANISH_CONNECTORS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "e",
  "el",
  "en",
  "la",
  "las",
  "los",
  "o",
  "para",
  "por",
  "sin",
  "sobre",
  "u",
  "una",
  "y",
]);

const ACRONYMS_MAP: Record<string, string> = {
  API: "API",
  BD: "BD",
  BIM: "BIM",
  CLI: "CLI",
  CMMI: "CMMI",
  CRM: "CRM",
  DEVOPS: "DevOps",
  DNS: "DNS",
  DSJ: "DSJ",
  DUTIC: "DUTIC",
  ERP: "ERP",
  GP: "GP",
  HCI: "HCI",
  HTTP: "HTTP",
  HTTPS: "HTTPS",
  IA: "IA",
  IOT: "IoT",
  IP: "IP",
  ISO: "ISO",
  JSON: "JSON",
  NOSQL: "NoSQL",
  OS: "OS",
  PDF: "PDF",
  PWA: "PWA",
  QA: "QA",
  REST: "REST",
  SIG: "SIG",
  SQL: "SQL",
  TCP: "TCP",
  TDD: "TDD",
  TI: "TI",
  UDP: "UDP",
  UI: "UI",
  UML: "UML",
  UNSA: "UNSA",
  UX: "UX",
  XML: "XML",
};

const ROMAN_NUMERAL_REGEX = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)$/;

const LETTER_REGEX = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;
const TOKEN_PARTS_REGEX =
  /^([^A-Za-zÀ-ÖØ-öø-ÿ0-9]*)([A-Za-zÀ-ÖØ-öø-ÿ0-9]+)([^A-Za-zÀ-ÖØ-öø-ÿ0-9]*)$/;

function isPredominantlyUppercase(text: string): boolean {
  const letters = text.match(LETTER_REGEX);
  if (!letters || letters.length < 2) {
    return false;
  }
  let upperCount = 0;
  for (const ch of letters) {
    if (ch === ch.toLocaleUpperCase("es-PE") && ch !== ch.toLocaleLowerCase("es-PE")) {
      upperCount += 1;
    }
  }
  return upperCount / letters.length >= 0.75;
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  const first = word.charAt(0).toLocaleUpperCase("es-PE");
  const rest = word.slice(1).toLocaleLowerCase("es-PE");
  return `${first}${rest}`;
}

function formatSingleWord(core: string, forceCapitalize: boolean): string {
  const upper = core.toLocaleUpperCase("es-PE");
  if (ACRONYMS_MAP[upper]) {
    return ACRONYMS_MAP[upper];
  }
  if (ROMAN_NUMERAL_REGEX.test(upper)) {
    return upper;
  }
  const lower = core.toLocaleLowerCase("es-PE");
  if (!forceCapitalize && SPANISH_CONNECTORS.has(lower)) {
    return lower;
  }
  return capitalizeWord(core);
}

/**
 * Normalize ALL CAPS Spanish course names and assignment titles into readable
 * Smart Title Case while preserving acronyms, Roman numerals, and mixed-case inputs.
 */
export function formatAcademicTitle(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed || !isPredominantlyUppercase(trimmed)) {
    return trimmed;
  }

  const tokens = trimmed.split(/\s+/);
  let forceNextCapitalize = true;

  const formatted = tokens.map((token) => {
    if (/^[-–—/:]+$/.test(token)) {
      forceNextCapitalize = true;
      return token;
    }

    const match = token.match(TOKEN_PARTS_REGEX);
    if (!match) {
      forceNextCapitalize = token.endsWith(":") || token.endsWith("-") || token.endsWith("/");
      return token;
    }

    const [, prefix, core, suffix] = match;
    const isParenGroup = prefix.includes("(") && suffix.includes(")") && core.length === 1;
    const formattedCore = isParenGroup
      ? core.toLocaleUpperCase("es-PE")
      : formatSingleWord(core, forceNextCapitalize || prefix.includes("("));

    forceNextCapitalize =
      suffix.includes(":") || suffix.includes("-") || suffix.includes("/");

    return `${prefix}${formattedCore}${suffix}`;
  });

  return formatted.join(" ");
}
