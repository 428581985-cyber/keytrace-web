import { encodePinyinSyllable, type ZhShuangpinSchemeId } from "@keybr/keyboard";
import { ZH_QP_LEXICON, ZH_QP_SYLLABLE_TO_CHARS } from "./zh-quanpin-lexicon.ts";

type DerivedShuangpinLexicon = {
  readonly words: readonly string[];
  readonly wordToHanzi: ReadonlyMap<string, string>;
  readonly syllableToChars: ReadonlyMap<string, string>;
};

const cache = new Map<ZhShuangpinSchemeId, DerivedShuangpinLexicon>();

function deriveShuangpinLexicon(
  schemeId: ZhShuangpinSchemeId,
): DerivedShuangpinLexicon {
  const words: string[] = [];
  const wordToHanzi = new Map<string, string>();

  for (const [qpCode, rawValue] of Object.entries(ZH_QP_LEXICON)) {
    const sep = rawValue.indexOf(":");
    if (sep <= 0) {
      continue;
    }
    const lengthsPart = rawValue.slice(0, sep);
    const hanzi = rawValue.slice(sep + 1);
    let offset = 0;
    let spCode = "";
    let valid = true;

    for (let i = 0; i < lengthsPart.length; i += 1) {
      const len = lengthsPart.charCodeAt(i) - 48;
      if (len <= 0 || offset + len > qpCode.length) {
        valid = false;
        break;
      }
      const syllable = qpCode.slice(offset, offset + len);
      offset += len;
      const encoded = encodePinyinSyllable(syllable, schemeId);
      if (encoded.length !== 2) {
        valid = false;
        break;
      }
      spCode += encoded;
    }

    if (!valid || offset !== qpCode.length || spCode.length < 2) {
      continue;
    }
    if (!wordToHanzi.has(spCode)) {
      wordToHanzi.set(spCode, hanzi);
      words.push(spCode);
    }
  }

  const syllableToChars = new Map<string, string>();
  for (const [qpSyllable, chars] of Object.entries(ZH_QP_SYLLABLE_TO_CHARS)) {
    const encoded = encodePinyinSyllable(qpSyllable, schemeId);
    if (encoded.length !== 2) {
      continue;
    }
    const existing = syllableToChars.get(encoded);
    if (existing == null) {
      syllableToChars.set(encoded, chars);
    } else if (existing.length < 4) {
      syllableToChars.set(encoded, existing + chars);
    }
  }

  const derived: DerivedShuangpinLexicon = {
    words: Object.freeze(words),
    wordToHanzi,
    syllableToChars,
  };
  cache.set(schemeId, derived);
  return derived;
}

function getLexicon(schemeId: ZhShuangpinSchemeId): DerivedShuangpinLexicon {
  return cache.get(schemeId) ?? deriveShuangpinLexicon(schemeId);
}

export function getShuangpinWordList(
  schemeId: ZhShuangpinSchemeId,
): readonly string[] {
  return getLexicon(schemeId).words;
}

export function resolveShuangpinWord(
  code: string,
  schemeId: ZhShuangpinSchemeId,
): string | null {
  return getLexicon(schemeId).wordToHanzi.get(code.toLowerCase()) ?? null;
}

export function resolveShuangpinChar(
  code: string,
  schemeId: ZhShuangpinSchemeId,
): string | null {
  const chars = getLexicon(schemeId).syllableToChars.get(code.toLowerCase());
  if (chars == null || chars.length === 0) {
    return null;
  }
  return Array.from(chars)[0] ?? null;
}
