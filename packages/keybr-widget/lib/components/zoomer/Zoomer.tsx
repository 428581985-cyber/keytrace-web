import { Tasks } from "@keybr/lang";
import { mdiCursorMove } from "@mdi/js";
import { clsx } from "clsx";
import {
  cloneElement,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
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

const DEFAULT_POSITION: ZoomablePosition = { x: 0, y: 0, zoom: 1 };

export const ZoomerSuspendedContext = createContext(false);

export function useZoomerSuspended(): boolean {
  return useContext(ZoomerSuspendedContext);
}

export function Zoomer({
  children,
  id = null,
  suspended = false,
}: ZoomerProps): ReactNode {
  const contextSuspended = useZoomerSuspended();
  const isSuspended = suspended || contextSuspended;
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootEl(node);
  }, []);
  const [hover, setHover] = useState(false);
  const [moving, setMoving] = useState(false);
  const [{ x, y, zoom }, setPosition] = useState(
    (id && savedPositions.get(id)) || DEFAULT_POSITION,
  );
  const displayPosition = isSuspended ? DEFAULT_POSITION : { x, y, zoom };
  const effectiveHover = isSuspended ? false : hover;
  const effectiveMoving = isSuspended ? false : moving;

  const [suspendHoverTasks] = useState(() => new Tasks());
  const [suspendMovingTasks] = useState(() => new Tasks());

  useEffect(() => {
    return () => {
      suspendHoverTasks.cancelAll();
      suspendMovingTasks.cancelAll();
    };
  }, [suspendHoverTasks, suspendMovingTasks]);

  useEffect(() => {
    if (!isSuspended) {
      return;
    }
    if (globalMoving.current === rootRef.current) {
      globalMoving.current = null;
    }
    suspendHoverTasks.cancelAll();
    suspendMovingTasks.cancelAll();
    suspendHoverTasks.delayed(0, () => {
      setHover(false);
    });
    suspendMovingTasks.delayed(0, () => {
      setMoving(false);
    });
  }, [isSuspended, suspendHoverTasks, suspendMovingTasks]);

  useMouseWheel(rootEl, (ev) => {
    if (isSuspended) {
      return;
    }
    suspendHoverTasks.cancelAll();
    setPosition({ x, y, zoom: zoom - Math.sign(ev.deltaY) * 0.05 });
    setHover(true);
    ev.preventDefault();
  });
  useDocumentEvent("mousedown", (ev) => {
    if (isSuspended) {
      return;
    }
    const root = rootRef.current;
    if (root != null && !moving && contains(root, ev.target)) {
      suspendHoverTasks.cancelAll();
      suspendMovingTasks.cancelAll();
      setMoving(true);
      setHover(false);
      globalMoving.current = root;
      ev.preventDefault();
    }
  });
  useDocumentEvent("mouseup", (ev) => {
    const root = rootRef.current;
    if (root != null && moving) {
      if (!isSuspended) {
        suspendHoverTasks.cancelAll();
        suspendMovingTasks.cancelAll();
      }
      setMoving(false);
      setHover(!isSuspended);
      globalMoving.current = null;
      ev.preventDefault();
    }
  });
  useDocumentEvent("mousemove", (ev) => {
    if (isSuspended) {
      return;
    }
    const root = rootRef.current;
    if (root != null && moving) {
      setPosition({ x: x + ev.movementX, y: y + ev.movementY, zoom });
      ev.preventDefault();
    }
  });
  useWindowEvent("resize", () => {
    if (isSuspended) {
      return;
    }
    const root = rootRef.current;
    if (root != null) {
      setPosition(place(root).fitToScreen({ x, y, zoom }));
    }
  });
  useEffect(() => {
    if (isSuspended) {
      return;
    }
    const root = rootRef.current;
    if (root != null) {
      setPosition(place(root).fitToScreen({ x, y, zoom }));
    }
  }, [x, y, zoom, isSuspended]);
  useEffect(() => {
    if (id && !isSuspended) {
      savedPositions.set(id, { x, y, zoom });
      savePositions(savedPositions);
    }
  }, [id, x, y, zoom, isSuspended]);
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
      className={clsx(
        styles.root,
        (effectiveHover || effectiveMoving) && styles.hover,
      )}
      style={{
        position: "relative",
        left: displayPosition.x,
        top: displayPosition.y,
        transform: `scale(${displayPosition.zoom})`,
      }}
      onMouseEnter={() => {
        if (!isSuspended) {
          suspendHoverTasks.cancelAll();
          setHover(globalMoving.current == null);
        }
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
      onClick={(ev) => {
        if (isSuspended) {
          return;
        }
        if (ev.altKey) {
          setHover(false);
          setMoving(false);
          setPosition(DEFAULT_POSITION);
        }
      }}
    >
      {cloneElement(children, { ...children.props, moving: effectiveMoving })}
      {(effectiveHover || effectiveMoving) && (
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
