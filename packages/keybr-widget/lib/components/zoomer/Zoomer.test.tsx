import { test } from "node:test";
import { act, fireEvent, render } from "@testing-library/react";
import { equal, isNull } from "rich-assert";
import { Zoomer, ZoomerSuspendedContext } from "./Zoomer.tsx";
import { type ZoomableProps } from "./Zoomer.types.ts";

const STORAGE_KEY = "keybr.zoomer.positions";

function TestChild({ moving }: ZoomableProps) {
  return <div data-testid="child" data-moving={String(Boolean(moving))} />;
}

test("ZoomerSuspendedContext resets style to 0,0,1, preserves localStorage, blocks interactions, and restores position on resume", () => {
  window.localStorage.clear();

  try {
    const r = render(
      <ZoomerSuspendedContext.Provider value={false}>
        <Zoomer id="test-zoomer-ctx">
          <TestChild />
        </Zoomer>
      </ZoomerSuspendedContext.Provider>,
    );

    const child = r.getByTestId("child");
    const root = child.parentElement!;

    // Drag and wheel to non-default position.
    fireEvent.mouseDown(child);
    fireEvent.mouseMove(document, { movementX: 25, movementY: 15 });
    fireEvent.mouseUp(document);
    fireEvent.wheel(root, { deltaY: -100 });

    equal(root.style.left, "25px");
    equal(root.style.top, "15px");
    equal(root.style.transform, "scale(1.05)");

    const savedBefore = window.localStorage.getItem(STORAGE_KEY);
    const parsedBefore = JSON.parse(savedBefore!) as Record<
      string,
      { x: number; y: number; zoom: number }
    >;
    equal(parsedBefore["test-zoomer-ctx"].x, 25);
    equal(parsedBefore["test-zoomer-ctx"].y, 15);
    equal(parsedBefore["test-zoomer-ctx"].zoom, 1.05);

    // Suspend via context.
    r.rerender(
      <ZoomerSuspendedContext.Provider value={true}>
        <Zoomer id="test-zoomer-ctx">
          <TestChild />
        </Zoomer>
      </ZoomerSuspendedContext.Provider>,
    );

    equal(root.style.left, "0px");
    equal(root.style.top, "0px");
    equal(root.style.transform, "scale(1)");
    equal(window.localStorage.getItem(STORAGE_KEY), savedBefore);

    // Interactions while suspended must not mutate style, moving state, or localStorage.
    fireEvent.wheel(root, { deltaY: -100 });
    fireEvent.mouseDown(child);
    equal(child.getAttribute("data-moving"), "false");
    fireEvent.mouseMove(document, { movementX: 40, movementY: 40 });
    fireEvent.mouseUp(document);
    fireEvent.click(root, { altKey: true });

    equal(root.style.left, "0px");
    equal(root.style.top, "0px");
    equal(root.style.transform, "scale(1)");
    equal(window.localStorage.getItem(STORAGE_KEY), savedBefore);

    // Resume via context.
    r.rerender(
      <ZoomerSuspendedContext.Provider value={false}>
        <Zoomer id="test-zoomer-ctx">
          <TestChild />
        </Zoomer>
      </ZoomerSuspendedContext.Provider>,
    );

    equal(root.style.left, "25px");
    equal(root.style.top, "15px");
    equal(root.style.transform, "scale(1.05)");
    equal(window.localStorage.getItem(STORAGE_KEY), savedBefore);

    r.unmount();
  } finally {
    window.localStorage.clear();
  }
});

test("suspended prop resets style to 0,0,1 without writing localStorage on first mount", async () => {
  window.localStorage.clear();

  try {
    const r = render(
      <Zoomer id="test-zoomer-prop" suspended={true}>
        <TestChild />
      </Zoomer>,
    );

    const root = r.getByTestId("child").parentElement!;
    equal(root.style.left, "0px");
    equal(root.style.top, "0px");
    equal(root.style.transform, "scale(1)");
    isNull(window.localStorage.getItem(STORAGE_KEY));

    // Unsuspend writes initial position and allows drag; re-suspend preserves it.
    r.rerender(
      <Zoomer id="test-zoomer-prop" suspended={false}>
        <TestChild />
      </Zoomer>,
    );

    fireEvent.mouseDown(r.getByTestId("child"));
    fireEvent.mouseMove(document, { movementX: 12, movementY: 18 });
    fireEvent.mouseUp(document);
    equal(root.style.left, "12px");
    equal(root.style.top, "18px");

    const saved = window.localStorage.getItem(STORAGE_KEY);
    r.rerender(
      <Zoomer id="test-zoomer-prop" suspended={true}>
        <TestChild />
      </Zoomer>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    equal(root.style.left, "0px");
    equal(root.style.top, "0px");
    equal(window.localStorage.getItem(STORAGE_KEY), saved);

    r.unmount();
  } finally {
    window.localStorage.clear();
  }
});

test("mid-drag synchronous suspend and resume resets moving to false without touching localStorage", async () => {
  window.localStorage.clear();

  try {
    const r = render(
      <ZoomerSuspendedContext.Provider value={false}>
        <Zoomer id="test-zoomer-quick-toggle">
          <TestChild />
        </Zoomer>
      </ZoomerSuspendedContext.Provider>,
    );

    const child = r.getByTestId("child");
    const root = child.parentElement!;

    // Start dragging without releasing mouseup.
    fireEvent.mouseDown(child);
    fireEvent.mouseMove(document, { movementX: 20, movementY: 10 });
    equal(child.getAttribute("data-moving"), "true");
    equal(root.style.left, "20px");
    equal(root.style.top, "10px");

    const savedBefore = window.localStorage.getItem(STORAGE_KEY);

    // Toggle ZoomerSuspendedContext true -> false synchronously within the same tick.
    r.rerender(
      <ZoomerSuspendedContext.Provider value={true}>
        <Zoomer id="test-zoomer-quick-toggle">
          <TestChild />
        </Zoomer>
      </ZoomerSuspendedContext.Provider>,
    );
    r.rerender(
      <ZoomerSuspendedContext.Provider value={false}>
        <Zoomer id="test-zoomer-quick-toggle">
          <TestChild />
        </Zoomer>
      </ZoomerSuspendedContext.Provider>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    equal(child.getAttribute("data-moving"), "false");
    equal(root.style.left, "20px");
    equal(root.style.top, "10px");
    equal(window.localStorage.getItem(STORAGE_KEY), savedBefore);

    // A genuine new drag started right after quick toggle (after releasing old drag) is not cleared by the old task.
    fireEvent.mouseDown(child);
    equal(child.getAttribute("data-moving"), "true");

    r.rerender(
      <ZoomerSuspendedContext.Provider value={true}>
        <Zoomer id="test-zoomer-quick-toggle">
          <TestChild />
        </Zoomer>
      </ZoomerSuspendedContext.Provider>,
    );
    fireEvent.mouseUp(document);
    r.rerender(
      <ZoomerSuspendedContext.Provider value={false}>
        <Zoomer id="test-zoomer-quick-toggle">
          <TestChild />
        </Zoomer>
      </ZoomerSuspendedContext.Provider>,
    );
    fireEvent.mouseDown(child);
    equal(child.getAttribute("data-moving"), "true");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    equal(child.getAttribute("data-moving"), "true");

    fireEvent.mouseUp(document);
    equal(child.getAttribute("data-moving"), "false");

    r.unmount();
  } finally {
    window.localStorage.clear();
  }
});
