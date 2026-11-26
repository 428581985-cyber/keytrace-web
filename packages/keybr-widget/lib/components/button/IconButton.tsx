import { clsx } from "clsx";
import { type ReactNode, useImperativeHandle, useRef } from "react";
import { getBoundingBox } from "../../utils/index.ts";
import { useAnchor } from "../popover/anchor.ts";
import * as styles from "./IconButton.module.less";
import { type IconButtonProps } from "./IconButton.types.ts";

export function IconButton({
  anchor,
  children,
  disabled,
  icon,
  label,
  ref,
  tabIndex,
  title,
  ...props
}: IconButtonProps): ReactNode {
  const element = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({
    focus() {
      element.current?.focus();
    },
    blur() {
      element.current?.blur();
    },
  }));
  const anchorRef = useAnchor(anchor);
  useImperativeHandle(anchorRef, () => ({
    getBoundingBox() {
      return getBoundingBox(element.current!);
    },
  }));
  if (children != null || label != null) {
    throw new TypeError();
  }
  return (
    <button
      {...props}
      ref={element}
      className={clsx(styles.root, disabled && styles.disabled)}
      disabled={disabled}
      tabIndex={tabIndex}
      title={title}
    >
      {icon}
    </button>
  );
}
