import { ICON_CATALOG, SEARCHABLE_ICONS, type IconOption } from "./iconCatalog";

// Proposta locale e deterministica di un'icona a partire dal nome di un'entità: confronta le parole del nome
// con le etichette del catalogo (curato, poi Azure/Microsoft 365, poi loghi) e con una piccola tabella di
// sinonimi italiano/inglese verso le icone curate. Sotto soglia non propone nulla (resta il monogramma).

const MIN_SCORE = 50;

// Parole troppo generiche per identificare un'icona da sole.
const STOP_WORDS = new Set([
  "service", "services", "servizio", "servizi", "azure", "microsoft", "server", "the", "and", "per", "del", "della", "dei", "delle", "con", "new", "nuovo", "nuova", "di", "da", "il", "la", "le", "lo", "gli", "un", "una",
  "system", "sistema", "app", "applicazione", "manager", "gestione", "layer", "module", "modulo",
]);

// Parola (normalizzata) → id di un'icona del catalogo curato.
const SYNONYMS: Record<string, string> = {
  database: "sql", db: "sql", sql: "sql", dati: "sql", data: "sql",
  coda: "sb", code: "sb", queue: "sb", bus: "sb", messaggi: "sb", messaging: "sb", broker: "sb",
  segreti: "kv", segreto: "kv", secret: "kv", secrets: "kv", vault: "kv", chiavi: "kv", keys: "kv",
  utenti: "entra", utente: "entra", identity: "entra", identita: "entra", login: "entra", sso: "entra", auth: "entra", autenticazione: "entra",
  log: "ai", logs: "ai", monitor: "ai", monitoraggio: "ai", telemetria: "ai", telemetry: "ai", insights: "ai", observability: "ai",
  api: "apim", gateway: "apim",
  storage: "blob", file: "blob", files: "blob", documenti: "blob", archivio: "blob", blob: "blob",
  funzione: "func", funzioni: "func", function: "func", functions: "func", serverless: "func",
  rete: "vnet", network: "vnet", vnet: "vnet",
  pagamenti: "stripe", pagamento: "stripe", payment: "stripe", payments: "stripe",
  email: "sendgrid", mail: "sendgrid", posta: "sendgrid",
  erp: "bc", gestionale: "bc",
  frontend: "next", web: "next", sito: "next",
  cdn: "cloudflare", dns: "cloudflare",
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.#+]+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

interface Indexed {
  icon: IconOption;
  words: string[];
  label: string;
  bonus: number;
}

let index: Indexed[] | null = null;

function getIndex(): Indexed[] {
  if (index) return index;
  const curated = new Set(ICON_CATALOG.map((i) => i.id));
  const seen = new Set<string>();
  const all: Indexed[] = [];
  for (const icon of [...ICON_CATALOG, ...SEARCHABLE_ICONS]) {
    if (seen.has(icon.id)) continue;
    seen.add(icon.id);
    const bonus = curated.has(icon.id) ? 5 : icon.id.startsWith("azure/") ? 2 : icon.id.startsWith("ms365/") ? 1 : 0;
    all.push({ icon, words: words(icon.label), label: normalize(icon.label), bonus });
  }
  index = all;
  return all;
}

export function suggestIcon(name: string): string | undefined {
  const full = normalize(name);
  if (full.length < 2) return undefined;
  const tokens = words(name).filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  if (tokens.length === 0) return undefined;

  let best: { id: string; score: number } | undefined;
  const consider = (id: string, score: number) => {
    if (score >= MIN_SCORE && (!best || score > best.score)) best = { id, score };
  };

  for (const t of tokens) {
    const id = SYNONYMS[t];
    if (id) consider(id, 110);
  }

  for (const { icon, words: lw, label, bonus } of getIndex()) {
    const meaningful = lw.filter((w) => !STOP_WORDS.has(w));
    if (meaningful.length === 0) continue;
    if (label === full) {
      consider(icon.id, 120 + bonus);
      continue;
    }
    let matched = 0;
    for (const w of meaningful) {
      if (tokens.includes(w)) matched += 1;
      else if (w.length >= 4 && tokens.some((t) => t.length >= 4 && (t.startsWith(w) || w.startsWith(t)))) matched += 0.6;
    }
    if (matched === 0) continue;
    const coverage = matched / meaningful.length;
    // etichette più corte e più specifiche battono quelle lunghe a parità di copertura
    consider(icon.id, 100 * coverage - meaningful.length * 0.5 + bonus);
  }

  return best?.id;
}

export function iconLabel(id: string): string | undefined {
  return getIndex().find((i) => i.icon.id === id)?.icon.label;
}
