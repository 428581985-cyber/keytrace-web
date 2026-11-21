import { type PageInfo, Pages } from "@keybr/pages-shared";
import { useEffect } from "react";
import { useIntl } from "react-intl";

export function Title({ page }: { readonly page: PageInfo }) {
  const { formatMessage, locale } = useIntl();
  const title =
    page.path === Pages.keytrace.path && locale.startsWith("zh")
      ? "键盘监控"
      : formatMessage(page.title);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
