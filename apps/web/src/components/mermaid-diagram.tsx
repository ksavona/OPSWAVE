"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export interface MermaidEntityTarget {
  delegates?: readonly {
    alias: string | null;
    displayName: string;
    profileDescription: string | null;
  }[];
  entityId: string;
  entityType: "project" | "task";
  mermaidId: string;
}

const svgNaturalSize = (svg: string): { height: number; width: number } | null => {
  if (svg.length === 0) return null;
  const viewBox = /\bviewBox=["']([^"']+)["']/iu.exec(svg)?.[1]?.trim().split(/\s+/u).map(Number);
  const width = viewBox?.length === 4 ? viewBox[2] : undefined;
  const height = viewBox?.length === 4 ? viewBox[3] : undefined;
  return {
    height: height !== undefined && Number.isFinite(height) && height > 0 ? height : 480,
    width: width !== undefined && Number.isFinite(width) && width > 0 ? width : 800,
  };
};

export const MermaidDiagram = ({
  definition,
  entities = [],
  onEntityOpen,
}: {
  definition: string;
  entities?: MermaidEntityTarget[];
  onEntityOpen?: (entity: Pick<MermaidEntityTarget, "entityId" | "entityType">) => void;
}) => {
  const reactId = useId();
  const [error, setError] = useState("");
  const [matchIndex, setMatchIndex] = useState(-1);
  const [matchTotal, setMatchTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [svg, setSvg] = useState("");
  const [zoom, setZoom] = useState(1);
  const naturalSize = useMemo(() => svgNaturalSize(svg), [svg]);
  const canvas = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef({
    active: false,
    left: 0,
    moved: false,
    pointerId: -1,
    top: 0,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    let active = true;
    setError("");
    setSvg("");
    setZoom(1);
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          darkMode: true,
          flowchart: { curve: "stepAfter", htmlLabels: false, useMaxWidth: false },
          securityLevel: "strict",
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: "dark",
          themeCSS:
            ".cluster rect,.node rect { rx: 14px; ry: 14px; } .edgePath path { stroke-linejoin: round; }",
        });
        const id = `opsweave-mermaid-${reactId.replaceAll(/[^a-zA-Z0-9_-]/gu, "")}`;
        const rendered = await mermaid.render(id, definition);
        if (active) setSvg(rendered.svg);
      })
      .catch(() => {
        if (active) setError("The dependency diagram could not be rendered.");
      });
    return () => {
      active = false;
    };
  }, [definition, reactId]);

  const fitToViewport = useCallback(() => {
    const container = viewport.current;
    if (container === null || naturalSize === null) return;
    const availableWidth = container.clientWidth - 32;
    const availableHeight = container.clientHeight - 32;
    if (availableWidth <= 0 || availableHeight <= 0) return;
    const fitted = Math.min(
      availableWidth / naturalSize.width,
      availableHeight / naturalSize.height,
    );
    if (!Number.isFinite(fitted) || fitted <= 0) return;
    setZoom(fitted);
    window.requestAnimationFrame(() => {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    });
  }, [naturalSize]);

  useEffect(() => {
    const container = viewport.current;
    if (container === null || naturalSize === null) return;
    fitToViewport();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      fitToViewport();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [fitToViewport, naturalSize]);

  useEffect(() => {
    const container = viewport.current;
    if (container === null || svg.length === 0) return;
    for (const element of container.querySelectorAll<SVGElement>("[id]")) {
      element.querySelector(":scope > .mermaid-delegation-badge")?.remove();
      element.querySelector(":scope > title[data-opsweave-delegations]")?.remove();
      delete element.dataset.opsweaveEntityId;
      delete element.dataset.opsweaveEntityType;
      element.classList.remove("mermaid-entity-link");
      element.removeAttribute("role");
      element.removeAttribute("tabindex");
      const elementId = element.id;
      const entity = [...entities]
        .sort((left, right) => right.mermaidId.length - left.mermaidId.length)
        .find(
          ({ mermaidId }) =>
            elementId === mermaidId ||
            elementId.startsWith(`${mermaidId}-`) ||
            elementId.endsWith(`-${mermaidId}`) ||
            elementId.includes(`-${mermaidId}-`),
        );
      if (entity === undefined) continue;
      element.dataset.opsweaveEntityId = entity.entityId;
      element.dataset.opsweaveEntityType = entity.entityType;
      element.classList.add("mermaid-entity-link");
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      const delegates = entity.delegates ?? [];
      if (delegates.length > 0 && element instanceof SVGGElement) {
        const namespace = "http://www.w3.org/2000/svg";
        const title = document.createElementNS(namespace, "title");
        title.dataset.opsweaveDelegations = "true";
        title.textContent = `Delegated to ${delegates
          .map((delegate) =>
            [delegate.displayName, delegate.alias, delegate.profileDescription]
              .filter((value) => value !== null && value.length > 0)
              .join(" · "),
          )
          .join("; ")}`;
        element.prepend(title);
        if (element.classList.contains("node")) {
          const box = element.getBBox();
          const badge = document.createElementNS(namespace, "g");
          badge.classList.add("mermaid-delegation-badge");
          badge.setAttribute(
            "transform",
            `translate(${String(box.x + box.width - 18)} ${String(box.y + 6)})`,
          );
          badge.setAttribute("aria-hidden", "true");
          badge.innerHTML =
            '<circle cx="5" cy="4" r="3"/><circle cx="11" cy="5" r="2.5"/><path d="M0 13c0-3 2-5 5-5s5 2 5 5M8 13c.2-2.4 1.7-4 4-4 2.5 0 4 1.7 4 4" fill="none" stroke="currentColor" stroke-width="1.6"/>';
          element.append(badge);
        }
      }
    }
  }, [entities, svg]);

  const openEntityFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element) || onEntityOpen === undefined) return;
    const element = target.closest<SVGElement>("[data-opsweave-entity-id]");
    const entityId = element?.dataset.opsweaveEntityId;
    const entityType = element?.dataset.opsweaveEntityType;
    if (entityId !== undefined && (entityType === "project" || entityType === "task"))
      onEntityOpen({ entityId, entityType });
  };

  const focusMatch = (direction: number) => {
    const container = viewport.current;
    if (container === null) return;
    const nodes = [...container.querySelectorAll<SVGGElement>("g.node")];
    for (const node of nodes) node.classList.remove("mermaid-search-match");
    const matches =
      query.trim().length === 0
        ? []
        : nodes.filter((node) => node.textContent.toLowerCase().includes(query.toLowerCase()));
    setMatchTotal(matches.length);
    if (matches.length === 0) {
      setMatchIndex(-1);
      return;
    }
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    const target = matches.at(next);
    if (target === undefined) return;
    target.classList.add("mermaid-search-match");
    const targetBox = target.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    container.scrollBy({
      behavior: "smooth",
      left: targetBox.left - containerBox.left - container.clientWidth / 2 + targetBox.width / 2,
      top: targetBox.top - containerBox.top - container.clientHeight / 2 + targetBox.height / 2,
    });
  };

  const changeZoom = (nextValue: number, clientX?: number, clientY?: number) => {
    if (!Number.isFinite(nextValue) || nextValue <= 0) return;
    const next = nextValue;
    const container = viewport.current;
    if (container !== null && clientX !== undefined && clientY !== undefined) {
      const box = container.getBoundingClientRect();
      const contentX = container.scrollLeft + clientX - box.left;
      const contentY = container.scrollTop + clientY - box.top;
      const ratio = next / zoom;
      window.requestAnimationFrame(() => {
        container.scrollLeft = contentX * ratio - (clientX - box.left);
        container.scrollTop = contentY * ratio - (clientY - box.top);
      });
    }
    setZoom(next);
  };

  const zoomLabel = `${
    zoom * 100 >= 10 ? String(Math.round(zoom * 100)) : (zoom * 100).toFixed(2)
  }%`;

  if (error.length > 0)
    return (
      <p className="form-message error" role="alert">
        {error}
      </p>
    );
  if (svg.length === 0) return <p className="muted">Rendering dependency diagram…</p>;
  return (
    <div className="diagram-explorer">
      <div className="diagram-controls">
        <label>
          Find in map
          <input
            onChange={(event) => {
              setQuery(event.target.value);
              setMatchIndex(-1);
              setMatchTotal(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") focusMatch(1);
            }}
            placeholder="Search task or project"
            type="search"
            value={query}
          />
        </label>
        <button
          className="secondary compact"
          onClick={() => {
            focusMatch(1);
          }}
          type="button"
        >
          {matchTotal > 1 ? "Next" : "Find"}
        </button>
        <span className="muted" aria-live="polite">
          {matchTotal === 0 || matchIndex < 0
            ? ""
            : `${String(matchIndex + 1)} of ${String(matchTotal)}`}
        </span>
        <div className="button-row">
          <button
            aria-label="Zoom out"
            className="secondary compact"
            onClick={() => {
              changeZoom(zoom / 1.25);
            }}
            type="button"
          >
            −
          </button>
          <button
            className="secondary compact"
            onClick={() => {
              fitToViewport();
            }}
            type="button"
            title="Fit diagram to the available space"
          >
            {zoomLabel}
          </button>
          <button
            aria-label="Zoom in"
            className="secondary compact"
            onClick={() => {
              changeZoom(zoom * 1.25);
            }}
            type="button"
          >
            +
          </button>
        </div>
      </div>
      <div
        aria-label="Rendered Mermaid dependency diagram"
        className="mermaid-diagram"
        onClick={(event) => {
          if (pan.current.moved) {
            pan.current.moved = false;
            return;
          }
          openEntityFromTarget(event.target);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          openEntityFromTarget(event.target);
        }}
        onPointerCancel={(event) => {
          if (pan.current.pointerId === event.pointerId) pan.current.active = false;
        }}
        onPointerDown={(event) => {
          const container = viewport.current;
          if (container === null) return;
          if (typeof container.setPointerCapture === "function")
            container.setPointerCapture(event.pointerId);
          pan.current = {
            active: true,
            left: container.scrollLeft,
            moved: false,
            pointerId: event.pointerId,
            top: container.scrollTop,
            x: event.clientX,
            y: event.clientY,
          };
        }}
        onPointerMove={(event) => {
          const container = viewport.current;
          if (
            container === null ||
            !pan.current.active ||
            pan.current.pointerId !== event.pointerId
          )
            return;
          if (
            Math.abs(event.clientX - pan.current.x) > 4 ||
            Math.abs(event.clientY - pan.current.y) > 4
          )
            pan.current.moved = true;
          event.preventDefault();
          container.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
          container.scrollTop = pan.current.top - (event.clientY - pan.current.y);
        }}
        onPointerUp={(event) => {
          const container = viewport.current;
          if (
            container !== null &&
            typeof container.hasPointerCapture === "function" &&
            container.hasPointerCapture(event.pointerId)
          )
            container.releasePointerCapture(event.pointerId);
          if (pan.current.pointerId === event.pointerId) pan.current.active = false;
        }}
        onWheel={(event) => {
          event.preventDefault();
          changeZoom(zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX, event.clientY);
        }}
        ref={viewport}
        role="region"
        tabIndex={0}
        title="Drag to pan. Use the mouse wheel to zoom."
      >
        <div
          className="mermaid-canvas"
          // Mermaid renders with strict security enabled; labels are encoded before this SVG is produced.
          dangerouslySetInnerHTML={{ __html: svg }}
          ref={canvas}
          style={
            naturalSize === null
              ? undefined
              : {
                  height: `${String(naturalSize.height * zoom)}px`,
                  width: `${String(naturalSize.width * zoom)}px`,
                }
          }
        />
      </div>
    </div>
  );
};
