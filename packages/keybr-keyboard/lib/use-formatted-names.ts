import { useIntlDisplayNames } from "@keybr/intl";
import { useIntl } from "react-intl";
import { type Language } from "./language.ts";
import { getZhSchemeFromLayout, type Layout } from "./layout.ts";

export const useFormattedNames = () => {
  const { formatMessage } = useIntl();
  const dn = useIntlDisplayNames();

  const formatLanguageName = (language: Language): string => {
    return dn.formatLanguageName(language.id);
  };

  const formatZhSchemeName = (layout: Layout): string => {
    switch (getZhSchemeFromLayout(layout)) {
      case "zh-sp":
        return formatMessage({
          id: "settings.keyboard.scheme.shuangpin",
          defaultMessage: "Xiaohe Shuangpin",
        });
      case "zh-sp-zrm":
        return formatMessage({
          id: "settings.keyboard.scheme.ziranma",
          defaultMessage: "Ziranma Shuangpin",
        });
      case "zh-sp-ms":
        return formatMessage({
          id: "settings.keyboard.scheme.microsoft",
          defaultMessage: "Microsoft Shuangpin",
        });
      case "zh-sp-sg":
        return formatMessage({
          id: "settings.keyboard.scheme.sogou",
          defaultMessage: "Sogou Shuangpin",
        });
      case "zh-qp":
        return formatMessage({
          id: "settings.keyboard.scheme.quanpin",
          defaultMessage: "Full Pinyin",
        });
      default:
        return formatLanguageName(layout.language);
    }
  };

  const formatLayoutName = (layout: Layout): string => {
    if (getZhSchemeFromLayout(layout) != null) {
      return formatZhSchemeName(layout);
    }
    return layout.name.replaceAll(/\{([-A-Z]+)\}/g, (regionId) => {
      return dn.formatRegionName(regionId.substring(1, regionId.length - 1));
    });
  };

  const formatFullLayoutName = (layout: Layout): string => {
    if (getZhSchemeFromLayout(layout) != null) {
      const zhLabel = formatMessage({
        id: "settings.keyboard.language.zh",
        defaultMessage: "Chinese",
      });
      return `${zhLabel} / ${formatZhSchemeName(layout)}`;
    }
    return `${formatLanguageName(layout.language)}/${formatLayoutName(layout)}`;
  };

  return {
    formatLanguageName,
    formatLayoutName,
    formatFullLayoutName,
    formatZhSchemeName,
  };
};
