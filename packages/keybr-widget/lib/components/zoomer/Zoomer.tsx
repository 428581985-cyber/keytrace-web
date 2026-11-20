import { Tasks } from "@keybr/lang";
import { mdiCursorMove } from "@mdi/js";
import { clsx } from "clsx";
import {
  cloneElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDocumentEvent, useWindowEvent } from "../../hooks/index.ts";
import { Icon } from "../icon/index.ts";
import { place } from "./place.ts";
import { useMouseWheel } from "./use-mouse-wheel.ts";
import * as styles from "./Zoomer.module.less";
import { type ZoomablePosition, type ZoomerProps } from "./Zoomer.types.ts";

const STORAGE_KEY = "keybr.zoomer.positions";

const globalMoving = { current: null as HTMLElement | null };

const savedPositions = loadSavedPositions();

function loadSavedPositions(): Map<string, ZoomablePosition> {
  const map = new Map<string, ZoomablePosition>();
  if (typeof window === "undefined") {
    return map;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      return map;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed != null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      for (const [id, value] of Object.entries(parsed)) {
        if (isValidPosition(value)) {
          map.set(id, { x: value.x, y: value.y, zoom: value.zoom });
        }
      }
    }
  } catch {
    // Ignore storage errors (SSR, private mode, corrupted JSON).
  }
  return map;
}

function isValidPosition(value: unknown): value is ZoomablePosition {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const { x, y, zoom } = value as Record<string, unknown>;
  return (
    typeof x === "number" &&
    Number.isFinite(x) &&
    typeof y === "number" &&
    Number.isFinite(y) &&
    typeof zoom === "number" &&
    Number.isFinite(zoom) &&
    zoom > 0
  );
}

function savePositions(positions: ReadonlyMap<string, ZoomablePosition>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(positions)),
    );
  } catch {
    // Ignore storage errors (SSR, private mode, quota exceeded).
  }
}

export function Zoomer({ children, id = null }: ZoomerProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootEl(node);
  }, []);
  const [hover, setHover] = useState(false);
  const [moving, setMoving] = useState(false);
  const [{ x, y, zoom }, setPosition] = useState(
    (id && savedPositions.get(id)) || { x: 0, y: 0, zoom: 1 },
  );
  useMouseWheel(rootEl, (ev) => {
    setPosition({ x, y, zoom: zoom - Math.sign(ev.deltaY) * 0.05 });
    setHover(true);
    ev.preventDefault();
  });
  useDocumentEvent("mousedown", (ev) => {
    const root = rootRef.current;
    if (root != null && !moving && contains(root, ev.target)) {
      setMoving(true);
      setHover(false);
      globalMoving.current = root;
      ev.preventDefault();
    }
  });
  useDocumentEvent("mouseup", (ev) => {
    const root = rootRef.current;
    if (root != null && moving) {
      setMoving(false);
      setHover(true);
      globalMoving.current = null;
      ev.preventDefault();
    }
  });
  useDocumentEvent("mousemove", (ev) => {
    const root = rootRef.current;
    if (root != null && moving) {
      setPosition({ x: x + ev.movementX, y: y + ev.movementY, zoom });
      ev.preventDefault();
    }
  });
  useWindowEvent("resize", () => {
    const root = rootRef.current;
    if (root != null) {
      setPosition(place(root).fitToScreen({ x, y, zoom }));
    }
  });
  useEffect(() => {
    const root = rootRef.current;
    if (root != null) {
      setPosition(place(root).fitToScreen({ x, y, zoom }));
    }
  }, [x, y, zoom]);
  useEffect(() => {
    if (id) {
      savedPositions.set(id, { x, y, zoom });
      savePositions(savedPositions);
    }
  }, [id, x, y, zoom]);
  useEffect(() => {
    const tasks = new Tasks();
    if (hover) {
      tasks.delayed(1000, () => {
        setHover(false);
      });
    }
    return () => {
      tasks.cancelAll();
    };
  }, [hover]);
  return (
    <div
      ref={setRoot}
      className={clsx(styles.root, (hover || moving) && styles.hover)}
      style={{
        position: "relative",
        left: x,
        top: y,
        transform: `scale(${zoom})`,
      }}
      onMouseEnter={() => {
        setHover(globalMoving.current == null);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
      onClick={(ev) => {
        if (ev.altKey) {
          setHover(false);
          setMoving(false);
          setPosition({ x: 0, y: 0, zoom: 1 });
        }
      }}
    >
      {cloneElement(children, { ...children.props, moving })}
      {(hover || moving) && (
        <Icon className={styles.icon} shape={mdiCursorMove} />
      )}
    </div>
  );
}

function contains(root: Element, target: unknown): boolean {
  return (
    target instanceof Element && (root === target || root.contains(target))
  );
}
