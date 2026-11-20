import { type PageInfo, Pages } from "@keybr/pages-shared";
import { Icon } from "@keybr/widget";
import { mdiTranslate } from "@mdi/js";
import { clsx } from "clsx";
import { type ReactNode } from "react";
import { useIntl } from "react-intl";
import { NavLink } from "react-router";
import * as styles from "./NavMenu.module.less";
import { ThemeSwitcher } from "./themes/ThemeSwitcher.tsx";

// 本地双语版：保留练习页、个人统计、帮助、主题切换，以及中/英双语切换入口。
export function NavMenu({ currentPath }: { readonly currentPath: string }) {
  return (
    <div className={styles.root}>
      <MenuItem>
        <ThemeSwitcher />
      </MenuItem>

      <MenuItem>
        <MenuItemLink page={Pages.practice} />
      </MenuItem>

      <MenuItem>
        <MenuItemLink page={Pages.profile} />
      </MenuItem>

      <MenuItem>
        <MenuItemLink page={Pages.help} />
      </MenuItem>

      <MenuItem>
        <LanguageToggle currentPath={currentPath} />
      </MenuItem>
    </div>
  );
}

function MenuItem({ children }: { readonly children: ReactNode }) {
  return <div className={styles.item}>{children}</div>;
}

function LanguageToggle({ currentPath }: { readonly currentPath: string }) {
  const { locale } = useIntl();
  const targetLocale = locale === "en" ? "zh-hans" : "en";
  const label = targetLocale === "en" ? "English" : "简体中文";
  return (
    <a className={styles.link} href={Pages.intlPath(currentPath, targetLocale)}>
      <Icon className={styles.icon} shape={mdiTranslate} />
      <span className={styles.label}>{label}</span>
    </a>
  );
}

function MenuItemLink({
  page: {
    path,
    link: { label, title, icon },
  },
}: {
  readonly page: PageInfo;
}) {
  const { formatMessage } = useIntl();
  return (
    <NavLink
      className={({ isActive }) =>
        clsx(styles.link, isActive && styles.isActive)
      }
      to={path}
      title={title && formatMessage(title)}
    >
      <Icon className={styles.icon} shape={icon ?? ""} />
      <span className={styles.label}>{formatMessage(label)}</span>
    </NavLink>
  );
}
