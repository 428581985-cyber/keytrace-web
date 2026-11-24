import { type IntlShape, useIntl } from "react-intl";
import { intlMemo } from "./memo.ts";

export type IntlDisplayNames = {
  formatRegionName(id: string): string;
  formatLanguageName(id: string): string;
  formatLocalLanguageName(id: string): string;
};

const capitalize = (value: string, locale: string): string =>
  value.replaceAll(
    /\p{Letter}+/gu,
    (word) =>
      word.substring(0, 1).toLocaleUpperCase(locale) +
      word.substring(1).toLocaleLowerCase(locale),
  );

const factory = (intl: IntlShape): IntlDisplayNames => {
  const { locale } = intl;
  const formatRegionName = (id: string): string => {
    const dn = intl.formatters.getDisplayNames(locale, {
      type: "region",
      fallback: "none",
    });
    return capitalize(dn.of(id) || "", locale) || id;
  };
  const formatLanguageName = (id: string): string => {
    // 自定义语言没有标准语言标签，Intl 只会把 id 原样吐出来，
    // 列表里就成了 "zh-sp"，没人认得出这是双拼。
    if (id === "zh-sp") {
      return locale.startsWith("zh") ? "中文双拼" : "Chinese Shuangpin";
    }
    if (id === "zh-qp") {
      return locale.startsWith("zh") ? "中文全拼" : "Chinese Full Pinyin";
    }
    const dn = intl.formatters.getDisplayNames(locale, {
      type: "language",
      fallback: "none",
    });
    return capitalize(dn.of(id) || "", locale) || id;
  };
  const formatLocalLanguageName = (id: string): string => {
    if (id === "zh-sp") {
      return "中文双拼";
    }
    if (id === "zh-qp") {
      return "中文全拼";
    }
    const dn = intl.formatters.getDisplayNames(id, {
      type: "language",
      fallback: "none",
    });
    return capitalize(dn.of(id) || "", id) || id;
  };
  return {
    formatRegionName,
    formatLanguageName,
    formatLocalLanguageName,
  };
};

export const makeIntlDisplayNames = intlMemo(Symbol("displayNames"), factory);

export const useIntlDisplayNames = (): IntlDisplayNames => {
  return makeIntlDisplayNames(useIntl());
};
