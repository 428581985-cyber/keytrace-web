export type ZhShuangpinSchemeId =
  | "zh-sp"
  | "zh-sp-zrm"
  | "zh-sp-ms"
  | "zh-sp-sg";

export type ZhSchemeId = ZhShuangpinSchemeId | "zh-qp";

export type ZeroInitialMode = "self" | "o";

export type ShuangpinSchemeDef = {
  readonly id: ZhShuangpinSchemeId;
  readonly initials: Readonly<{ zh: string; ch: string; sh: string }>;
  readonly finals: Readonly<Record<string, string>>;
  readonly zeroInitial: ZeroInitialMode;
  readonly usesSemicolon: boolean;
  readonly exampleText: string;
};

const REGULAR_INITIALS = new Set([
  "b",
  "p",
  "m",
  "f",
  "d",
  "t",
  "n",
  "l",
  "g",
  "k",
  "h",
  "j",
  "q",
  "x",
  "r",
  "z",
  "c",
  "s",
  "y",
  "w",
]);

const BASE_FINALS_ZRM: Readonly<Record<string, string>> = {
  a: "a",
  o: "o",
  e: "e",
  i: "i",
  u: "u",
  v: "v",
  ai: "l",
  an: "j",
  ang: "h",
  ao: "k",
  ei: "z",
  en: "f",
  eng: "g",
  er: "r",
  ia: "w",
  ian: "m",
  iang: "d",
  iao: "c",
  ie: "x",
  in: "n",
  ing: "y",
  iong: "s",
  iu: "q",
  ong: "s",
  ou: "b",
  ua: "w",
  uai: "y",
  uan: "r",
  uang: "d",
  ue: "t",
  ui: "v",
  un: "p",
  uo: "o",
  ve: "t",
};

export const ZH_SHUANGPIN_SCHEMES: Readonly<
  Record<ZhShuangpinSchemeId, ShuangpinSchemeDef>
> = {
  "zh-sp": {
    id: "zh-sp",
    initials: { zh: "v", ch: "i", sh: "u" },
    finals: {
      a: "a",
      o: "o",
      e: "e",
      i: "i",
      u: "u",
      v: "v",
      ai: "d",
      an: "j",
      ang: "h",
      ao: "c",
      ei: "w",
      en: "f",
      eng: "g",
      er: "r",
      ia: "x",
      ian: "m",
      iang: "l",
      iao: "n",
      ie: "p",
      in: "b",
      ing: "k",
      iong: "s",
      iu: "q",
      ong: "s",
      ou: "z",
      ua: "x",
      uai: "k",
      uan: "r",
      uang: "l",
      ue: "t",
      ui: "v",
      un: "y",
      uo: "o",
      ve: "t",
    },
    zeroInitial: "self",
    usesSemicolon: false,
    exampleText: "mwtm jmii tiug uuru sudu.",
  },
  "zh-sp-zrm": {
    id: "zh-sp-zrm",
    initials: { zh: "v", ch: "i", sh: "u" },
    finals: BASE_FINALS_ZRM,
    zeroInitial: "self",
    usesSemicolon: false,
    exampleText: "mztm jmii tiug uuru sudu.",
  },
  "zh-sp-ms": {
    id: "zh-sp-ms",
    initials: { zh: "v", ch: "i", sh: "u" },
    finals: {
      ...BASE_FINALS_ZRM,
      ing: ";",
      v: "y",
      ve: "v",
    },
    zeroInitial: "o",
    usesSemicolon: true,
    exampleText: "mztm jnx; tiug uuru sudu.",
  },
  "zh-sp-sg": {
    id: "zh-sp-sg",
    initials: { zh: "v", ch: "i", sh: "u" },
    finals: {
      ...BASE_FINALS_ZRM,
      ing: ";",
      v: "y",
      ve: "t",
    },
    zeroInitial: "o",
    usesSemicolon: true,
    exampleText: "mztm jnx; tiug uuru sudu.",
  },
};

export const ZH_SCHEME_ORDER: readonly ZhSchemeId[] = [
  "zh-sp",
  "zh-sp-zrm",
  "zh-sp-ms",
  "zh-sp-sg",
  "zh-qp",
];

export function isZhShuangpinSchemeId(id: string): id is ZhShuangpinSchemeId {
  return Object.hasOwn(ZH_SHUANGPIN_SCHEMES, id);
}

export function isZhSchemeId(id: string): id is ZhSchemeId {
  return id === "zh-qp" || isZhShuangpinSchemeId(id);
}

export function getShuangpinScheme(id: string): ShuangpinSchemeDef | null {
  return isZhShuangpinSchemeId(id) ? ZH_SHUANGPIN_SCHEMES[id] : null;
}

export function getZhSchemeExampleText(schemeId: ZhSchemeId): string {
  if (schemeId === "zh-qp") {
    return "meitian jianchi tisheng shuru sudu.";
  }
  return ZH_SHUANGPIN_SCHEMES[schemeId].exampleText;
}

export function encodePinyinSyllable(
  syllable: string,
  schemeId: ZhShuangpinSchemeId,
): string {
  const s = syllable.toLowerCase().replaceAll("ü", "v");
  if (s.length === 0) {
    return "";
  }
  const scheme = ZH_SHUANGPIN_SCHEMES[schemeId];

  // 2-character initials (zh, ch, sh)
  const two = s.slice(0, 2);
  if (two === "zh" || two === "ch" || two === "sh") {
    const finalPart = s.slice(2);
    const finalKey = scheme.finals[finalPart];
    if (finalKey == null) {
      return "";
    }
    return scheme.initials[two] + finalKey;
  }

  // Regular single-letter initial (b..w)
  const first = s[0];
  if (REGULAR_INITIALS.has(first) && s.length > 1) {
    const finalPart = s.slice(1);
    const finalKey = scheme.finals[finalPart];
    if (finalKey == null) {
      return "";
    }
    return first + finalKey;
  }

  // Zero-initial syllables (a, o, e, ai, an, ang, ao, ei, en, eng, er, ou)
  const finalKey = scheme.finals[s];
  if (finalKey == null) {
    return "";
  }
  if (scheme.zeroInitial === "o") {
    return "o" + finalKey;
  }
  if (s.length === 1) {
    return s + s;
  }
  if (s.length === 2) {
    return s;
  }
  return first + finalKey;
}

function keyIdForChar(ch: string): string {
  if (ch === ";") {
    return "Semicolon";
  }
  return `Key${ch.toUpperCase()}`;
}

const KEY_LABEL_FINALS_ORDER: readonly string[] = [
  "a",
  "e",
  "i",
  "uo",
  "o",
  "u",
  "ong",
  "iong",
  "ia",
  "ua",
  "ie",
  "iu",
  "ei",
  "ai",
  "ao",
  "ou",
  "an",
  "en",
  "ang",
  "eng",
  "in",
  "ing",
  "uai",
  "iang",
  "uang",
  "iao",
  "ian",
  "uan",
  "un",
  "ui",
  "v",
  "ue",
  "ve",
];

const keyLabelsCache = new Map<
  ZhShuangpinSchemeId,
  Readonly<Record<string, readonly string[]>>
>();

function buildKeyLabels(
  scheme: ShuangpinSchemeDef,
): Readonly<Record<string, readonly string[]>> {
  const map: Record<string, string[]> = {};
  const push = (ch: string, label: string) => {
    const keyId = keyIdForChar(ch);
    const list = (map[keyId] ??= []);
    if (!list.includes(label)) {
      list.push(label);
    }
  };

  // Show digraph initials first (sh, ch, zh).
  push(scheme.initials.sh, "sh");
  push(scheme.initials.ch, "ch");
  push(scheme.initials.zh, "zh");

  for (const finalName of KEY_LABEL_FINALS_ORDER) {
    const keyChar = scheme.finals[finalName];
    if (keyChar == null) {
      continue;
    }
    const display =
      finalName === "v" ? "ü" : finalName === "ve" ? "üe" : finalName;
    push(keyChar, display);
    if (finalName === "uan") {
      push(keyChar, "üan");
    } else if (finalName === "un") {
      push(keyChar, "ün");
    }
  }

  const frozen: Record<string, readonly string[]> = {};
  for (const [k, v] of Object.entries(map)) {
    frozen[k] = Object.freeze(v);
  }
  return Object.freeze(frozen);
}

export function getZhKeyLabelsForScheme(
  schemeId: ZhShuangpinSchemeId,
): Readonly<Record<string, readonly string[]>> {
  let cached = keyLabelsCache.get(schemeId);
  if (cached == null) {
    cached = buildKeyLabels(ZH_SHUANGPIN_SCHEMES[schemeId]);
    keyLabelsCache.set(schemeId, cached);
  }
  return cached;
}
