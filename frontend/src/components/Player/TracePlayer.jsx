import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { THEME } from "../../config/graphConfig";

const DRAG_MARGIN = 12;
const DRAG_THRESHOLD = 4;
const COLLAPSED_HEIGHT = 44;
const DEFAULT_BOTTOM_OFFSET = 16;
const BOTTOM_DOCK_THRESHOLD = 24;
const DOCK_OVERLAP_THRESHOLD = 1200;
const DOCK_EDGE_TRIGGER = 72;
const DOCK_RESERVED_GAP = 12;
const DOCK_PANEL_SELECTORS = {
  left: '[data-overlay-panel="sidebar"]',
  right: '[data-overlay-panel="details"]',
};

const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);

const clampPositionToViewport = (left, top, width, height) => {
  if (typeof window === "undefined") {
    return { left, top };
  }

  const maxLeft = Math.max(DRAG_MARGIN, window.innerWidth - width - DRAG_MARGIN);
  const maxTop = Math.max(DRAG_MARGIN, window.innerHeight - height - DRAG_MARGIN);

  return {
    left: clampValue(left, DRAG_MARGIN, maxLeft),
    top: clampValue(top, DRAG_MARGIN, maxTop),
  };
};

const getIntersectionArea = (a, b) => {
  if (!a || !b) return 0;

  const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return overlapWidth * overlapHeight;
};

const TracePlayer = ({
  traces,
  currentTrace,
  traceSteps = [],
  onSelectTrace,
  currentStep,
  totalSteps,
  onStepChange,
  failureIndices = [],
  showVisibleOnly = false,
  onToggleVisibleOnly,
  isVisibleFilterLoading = false,
  onDockLayoutChange,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showAmbiguousMarkers, setShowAmbiguousMarkers] = useState(false);
  const [showUnresolvedMarkers, setShowUnresolvedMarkers] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(null);
  const [dockSide, setDockSide] = useState(null);
  const [dragDockSide, setDragDockSide] = useState(null);
  const containerRef = useRef(null);
  const lastReportedDockLayoutRef = useRef({ side: null, reservedHeight: 0 });
  const dragRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    moved: false,
  });
  const suppressHeaderClickRef = useRef(false);

  const { ambiguousIndices, unresolvedIndices } = useMemo(() => {
    const ambiguous = [];
    const unresolved = [];

    traceSteps.forEach((step, index) => {
      const status = String(step?.data?.properties?.operationResolution || "").toLowerCase();
      if (status === "ambiguous") ambiguous.push(index);
      if (status === "unresolved") unresolved.push(index);
    });

    return { ambiguousIndices: ambiguous, unresolvedIndices: unresolved };
  }, [traceSteps]);

  // Auto-play logic
  useEffect(() => {
    let interval;
    if (isPlaying && currentStep < totalSteps - 1) {
      interval = setInterval(() => {
        onStepChange((prev) => prev + 1);
      }, 800); // 800ms per step
    } else {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentStep, totalSteps, onStepChange]);

  const getContainerDimensions = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      return {
        width: rect.width,
        height: rect.height,
      };
    }

    if (typeof window === "undefined") {
      return { width: 340, height: isCollapsed ? COLLAPSED_HEIGHT : 300 };
    }

    return {
      width: Math.min(340, Math.max(220, window.innerWidth - 96)),
      height: isCollapsed ? COLLAPSED_HEIGHT : 300,
    };
  }, [isCollapsed]);

  const clampToViewport = useCallback(
    (left, top) => {
      const { width, height } = getContainerDimensions();
      return clampPositionToViewport(left, top, width, height);
    },
    [getContainerDimensions]
  );

  const getDefaultPosition = useCallback(() => {
    if (typeof window === "undefined") {
      return { left: 24, top: 24 };
    }

    const { width, height } = getContainerDimensions();
    const centeredLeft = (window.innerWidth - width) / 2;
    const bottomAlignedTop = window.innerHeight - height - DEFAULT_BOTTOM_OFFSET;

    return clampToViewport(centeredLeft, bottomAlignedTop);
  }, [clampToViewport, getContainerDimensions]);

  const dockToBottomOnCollapse = useCallback(() => {
    if (typeof window === "undefined") return;

    const rect = containerRef.current?.getBoundingClientRect();
    setPosition((prev) => {
      if (!prev) return prev;

      const currentWidth = rect?.width ?? getContainerDimensions().width;
      const currentHeight = rect?.height ?? getContainerDimensions().height;
      const bottomGap = window.innerHeight - (prev.top + currentHeight);

      if (bottomGap > BOTTOM_DOCK_THRESHOLD) return prev;

      const targetTop = window.innerHeight - COLLAPSED_HEIGHT - DEFAULT_BOTTOM_OFFSET;
      const next = clampPositionToViewport(prev.left, targetTop, currentWidth, COLLAPSED_HEIGHT);

      if (next.left === prev.left && next.top === prev.top) return prev;
      return next;
    });
  }, [getContainerDimensions]);

  const detectDockSide = useCallback(
    (left, top) => {
      if (typeof window === "undefined") return null;

      const { width, height } = getContainerDimensions();
      const modalRect = {
        left,
        top,
        right: left + width,
        bottom: top + height,
      };

      const leftPanelRect = document.querySelector(DOCK_PANEL_SELECTORS.left)?.getBoundingClientRect() || null;
      const rightPanelRect = document.querySelector(DOCK_PANEL_SELECTORS.right)?.getBoundingClientRect() || null;

      const leftOverlap = getIntersectionArea(modalRect, leftPanelRect);
      const rightOverlap = getIntersectionArea(modalRect, rightPanelRect);

      if (leftOverlap >= DOCK_OVERLAP_THRESHOLD || rightOverlap >= DOCK_OVERLAP_THRESHOLD) {
        return rightOverlap > leftOverlap ? "right" : "left";
      }

      if (left <= DRAG_MARGIN + DOCK_EDGE_TRIGGER) return "left";
      if (left + width >= window.innerWidth - DRAG_MARGIN - DOCK_EDGE_TRIGGER) return "right";

      return null;
    },
    [getContainerDimensions]
  );

  useEffect(() => {
    if (position) return;
    setPosition(getDefaultPosition());
  }, [position, getDefaultPosition]);

  useEffect(() => {
    if (!position) return;

    const nextPosition = clampToViewport(position.left, position.top);
    if (nextPosition.left !== position.left || nextPosition.top !== position.top) {
      setPosition(nextPosition);
    }
  }, [isCollapsed, clampToViewport, position]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev) return getDefaultPosition();

        const next = clampToViewport(prev.left, prev.top);
        if (next.left === prev.left && next.top === prev.top) return prev;
        return next;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampToViewport, getDefaultPosition]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => {
      setPosition((prev) => {
        if (!prev) return prev;

        const next = clampToViewport(prev.left, prev.top);
        if (next.left === prev.left && next.top === prev.top) return prev;
        return next;
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [clampToViewport]);

  useEffect(() => {
    if (!onDockLayoutChange) return undefined;

    const nextLayout = !dockSide
      ? { side: null, reservedHeight: 0 }
      : (() => {
          const rect = containerRef.current?.getBoundingClientRect();
          const measuredHeight = Math.ceil(rect?.height || (isCollapsed ? COLLAPSED_HEIGHT : 300));
          return {
            side: dockSide,
            reservedHeight: measuredHeight + DOCK_RESERVED_GAP,
          };
        })();

    const previousLayout = lastReportedDockLayoutRef.current;
    const didChange =
      previousLayout.side !== nextLayout.side ||
      previousLayout.reservedHeight !== nextLayout.reservedHeight;

    if (!didChange) return undefined;

    lastReportedDockLayoutRef.current = nextLayout;
    onDockLayoutChange(nextLayout);

    return undefined;
  }, [dockSide, isCollapsed, onDockLayoutChange]);

  useEffect(() => {
    return () => {
      const clearedLayout = { side: null, reservedHeight: 0 };
      const previousLayout = lastReportedDockLayoutRef.current;
      const didChange =
        previousLayout.side !== clearedLayout.side ||
        previousLayout.reservedHeight !== clearedLayout.reservedHeight;

      if (didChange) {
        lastReportedDockLayoutRef.current = clearedLayout;
        onDockLayoutChange?.(clearedLayout);
      }
    };
  }, [onDockLayoutChange]);

  useEffect(() => {
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    if (isDragging) {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    }

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isDragging]);

  const handleHeaderPointerDown = useCallback(
    (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest("button")) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      event.currentTarget.setPointerCapture?.(event.pointerId);

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: position?.left ?? rect.left,
        startTop: position?.top ?? rect.top,
        moved: false,
      };

      setDragDockSide(dockSide);
    },
    [dockSide, position]
  );

  const handleHeaderPointerMove = useCallback(
    (event) => {
      const dragState = dragRef.current;
      if (dragState.pointerId === null || event.pointerId !== dragState.pointerId) return;

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      const movedEnough = Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD;

      if (!dragState.moved && !movedEnough) return;

      if (!dragState.moved) {
        dragState.moved = true;
        suppressHeaderClickRef.current = true;
        setIsDragging(true);
      }

      event.preventDefault();

      const nextLeft = dragState.startLeft + deltaX;
      const nextTop = dragState.startTop + deltaY;
      const clampedPosition = clampToViewport(nextLeft, nextTop);
      setPosition(clampedPosition);
      setDragDockSide(detectDockSide(clampedPosition.left, clampedPosition.top));
    },
    [clampToViewport, detectDockSide]
  );

  const finishDrag = useCallback((event) => {
    const pointerId = event?.pointerId;
    const dragState = dragRef.current;
    if (dragState.pointerId === null || dragState.pointerId !== pointerId) return;

    const pointerX = Number.isFinite(event?.clientX) ? event.clientX : dragState.startX;
    const pointerY = Number.isFinite(event?.clientY) ? event.clientY : dragState.startY;
    const deltaX = pointerX - dragState.startX;
    const deltaY = pointerY - dragState.startY;
    const finalPosition = clampToViewport(
      dragState.startLeft + deltaX,
      dragState.startTop + deltaY
    );

    if (dragState.moved) {
      setPosition(finalPosition);
      const side = detectDockSide(finalPosition.left, finalPosition.top);
      setDockSide(side);
      setDragDockSide(side);
    } else {
      setDragDockSide(null);
    }

    dragRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0,
      moved: false,
    };

    setIsDragging(false);
  }, [clampToViewport, detectDockSide]);

  const handleHeaderClick = useCallback(() => {
    if (suppressHeaderClickRef.current) {
      suppressHeaderClickRef.current = false;
      return;
    }

    if (!isCollapsed) {
      dockToBottomOnCollapse();
    }
    setIsCollapsed((prev) => !prev);
  }, [dockToBottomOnCollapse, isCollapsed]);

  const handleCollapseToggle = useCallback((event) => {
    event.stopPropagation();
    if (!isCollapsed) {
      dockToBottomOnCollapse();
    }
    setIsCollapsed((prev) => !prev);
  }, [dockToBottomOnCollapse, isCollapsed]);

  return (
    <>
    {isDragging && (
      <>
        <div style={styles.dockHintZone("left", dragDockSide === "left")}>
          <span style={styles.dockHintLabel}>Snap with Sidebar</span>
          <span style={styles.dockHintText}>Drop here to stack Trace Replay below filters.</span>
        </div>
        <div style={styles.dockHintZone("right", dragDockSide === "right")}>
          <span style={styles.dockHintLabel}>Snap with Details</span>
          <span style={styles.dockHintText}>Drop here to stack Trace Replay below details.</span>
        </div>
      </>
    )}
    <div ref={containerRef} style={styles.container(isCollapsed, position, isDragging)}>
      {/* Header / Collapse Bar */}
      <div
        style={styles.header(isDragging)}
        onClick={handleHeaderClick}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={styles.indicator}>●</span>
          <span style={styles.title}>Trace Replay</span>
          {currentTrace && (
            <span style={styles.traceName}>/ {currentTrace.name}</span>
          )}
        </div>
        <button type="button" style={styles.collapseBtn} onClick={handleCollapseToggle}>
          {isCollapsed ? "▲" : "▼"}
        </button>
      </div>

      {!isCollapsed && (
        <div style={styles.body}>
          {/* Select */}
          <select
            style={styles.select}
            onChange={(e) => onSelectTrace(e.target.value)}
            value={currentTrace ? currentTrace.id : ""}
          >
            <option value="">Select Scenario...</option>
            {traces.map((trace) => (
              <option key={trace.id} value={trace.id}>
                {trace.name}
              </option>
            ))}
          </select>

          {currentTrace && (
            <>
              <div style={styles.traceFilterRow}>
                <button
                  type="button"
                  style={styles.visibleOnlyBtn(showVisibleOnly)}
                  onClick={onToggleVisibleOnly}
                  disabled={!onToggleVisibleOnly || isVisibleFilterLoading}
                >
                  {showVisibleOnly ? "Visible Components: ON" : "Visible Components: OFF"}
                </button>
                {isVisibleFilterLoading && <span style={styles.traceFilterMeta}>Filtering...</span>}
              </div>

              {/* Controls */}
              <div style={styles.controlsRow}>
                <div style={styles.buttonGroup}>
                  <button
                    style={styles.iconBtn}
                    onClick={() => onStepChange(0)}
                  >
                    ⏮
                  </button>
                  <button
                    style={styles.iconBtn}
                    onClick={() => onStepChange(Math.max(0, currentStep - 1))}
                  >
                    ⏪
                  </button>
                </div>

                <button
                  style={isPlaying ? styles.playBtnActive : styles.playBtn}
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? "PAUSE" : "PLAY"}
                </button>

                <div style={styles.buttonGroup}>
                  <button
                    style={styles.iconBtn}
                    onClick={() =>
                      onStepChange(Math.min(totalSteps - 1, currentStep + 1))
                    }
                  >
                    ⏩
                  </button>
                  <button
                    style={styles.iconBtn}
                    onClick={() => onStepChange(totalSteps - 1)}
                  >
                    ⏭
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div style={styles.timelineWrapper}>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, totalSteps - 1)}
                  value={currentStep}
                  onChange={(e) => onStepChange(Number(e.target.value))}
                  style={styles.slider}
                />
                {/* Error Markers */}
                {failureIndices.map((idx) => (
                  <div
                    key={idx}
                    title={`Failure at step ${idx}`}
                    onClick={() => onStepChange(idx)}
                    style={{
                      ...styles.errorMarker,
                      left: `${(idx / Math.max(1, totalSteps - 1)) * 100}%`,
                    }}
                  />
                ))}
                {showAmbiguousMarkers && ambiguousIndices.map((idx) => (
                  <div
                    key={`ambiguous_${idx}`}
                    title={`Ambiguous at step ${idx + 1}`}
                    onClick={() => onStepChange(idx)}
                    style={{
                      ...styles.ambiguousMarker,
                      left: `${(idx / Math.max(1, totalSteps - 1)) * 100}%`,
                    }}
                  />
                ))}
                {showUnresolvedMarkers && unresolvedIndices.map((idx) => (
                  <div
                    key={`unresolved_${idx}`}
                    title={`Unresolved at step ${idx + 1}`}
                    onClick={() => onStepChange(idx)}
                    style={{
                      ...styles.unresolvedMarker,
                      left: `${(idx / Math.max(1, totalSteps - 1)) * 100}%`,
                    }}
                  />
                ))}
              </div>

              <div style={styles.markerToggleRow}>
                <button
                  type="button"
                  style={styles.markerToggleBtn(showAmbiguousMarkers, "ambiguous")}
                  onClick={() => setShowAmbiguousMarkers((prev) => !prev)}
                >
                  <span style={styles.markerDot(THEME.warning)}></span>
                  Ambiguous ({ambiguousIndices.length})
                </button>
                <button
                  type="button"
                  style={styles.markerToggleBtn(showUnresolvedMarkers, "unresolved")}
                  onClick={() => setShowUnresolvedMarkers((prev) => !prev)}
                >
                  <span style={styles.markerDot(THEME.danger)}></span>
                  Unresolved ({unresolvedIndices.length})
                </button>
              </div>

              <div style={styles.meta}>
                <span>
                  Step:{" "}
                  <span style={{ color: THEME.primary }}>
                    {currentStep + 1}
                  </span>
                </span>
                <span style={{ color: THEME.textMuted }}>
                  Total: {totalSteps}
                </span>
              </div>

            </>
          )}
        </div>
      )}
    </div>
    </>
  );
};

// Styles
const styles = {
  container: (collapsed, position, isDragging) => ({
    position: "fixed",
    top: position ? position.top : "auto",
    left: position ? position.left : "50%",
    bottom: position ? "auto" : DEFAULT_BOTTOM_OFFSET,
    transform: position ? "none" : "translateX(-50%)",
    width: "min(340px, calc(100vw - 96px))",
    maxHeight: collapsed ? "44px" : "60vh",
    backgroundColor: "rgba(30, 30, 30, 0.95)",
    backdropFilter: "blur(10px)",
    borderRadius: "16px",
    border: `1px solid ${THEME.border}`,
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    zIndex: 2000,
    overflow: "hidden",
    cursor: isDragging ? "grabbing" : "default",
    willChange: isDragging ? "top, left" : "auto",
    transition: isDragging
      ? "none"
      : "max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  }),
  header: (isDragging) => ({
    padding: "12px 20px",
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: isDragging ? "grabbing" : "grab",
    borderBottom: `1px solid ${THEME.border}`,
    userSelect: "none",
    touchAction: "none",
  }),
  indicator: { color: THEME.success, fontSize: "10px" },
  title: { fontSize: "13px", fontWeight: 600, color: THEME.textMain },
  traceName: { fontSize: "13px", color: THEME.textMuted },
  collapseBtn: {
    background: "none",
    border: "none",
    color: THEME.textMuted,
    cursor: "pointer",
  },

  body: {
    padding: "12px",
    maxHeight: "calc(60vh - 44px)",
    overflowY: "auto",
  },
  select: {
    width: "100%",
    padding: "8px",
    borderRadius: "8px",
    marginBottom: "12px",
    background: THEME.bg,
    border: `1px solid ${THEME.border}`,
    color: THEME.textMain,
    outline: "none",
    fontSize: "12px",
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  traceFilterRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "8px",
  },
  visibleOnlyBtn: (active) => ({
    borderRadius: "8px",
    border: `1px solid ${active ? THEME.primary : THEME.border}`,
    background: active ? `${THEME.primary}22` : "rgba(255,255,255,0.03)",
    color: active ? THEME.primary : THEME.textMain,
    padding: "6px 10px",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  }),
  traceFilterMeta: {
    fontSize: "11px",
    color: THEME.textMuted,
    fontFamily: "monospace",
  },
  buttonGroup: { display: "flex", gap: "5px" },
  iconBtn: {
    background: "transparent",
    border: `1px solid ${THEME.border}`,
    color: THEME.textMain,
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    ":hover": { background: "#333" },
  },
  playBtn: {
    padding: "7px 16px",
    borderRadius: "30px",
    background: THEME.primary,
    color: "white",
    border: "none",
    fontWeight: 700,
    fontSize: "11px",
    letterSpacing: "1px",
    cursor: "pointer",
    boxShadow: `0 4px 15px ${THEME.primary}40`,
  },
  playBtnActive: {
    padding: "7px 16px",
    borderRadius: "30px",
    background: "#333",
    color: "#fff",
    border: "1px solid #555",
    fontWeight: 700,
    fontSize: "11px",
    cursor: "pointer",
  },
  timelineWrapper: {
    position: "relative",
    height: "20px",
    display: "flex",
    alignItems: "center",
  },
  slider: {
    width: "100%",
    cursor: "pointer",
    accentColor: THEME.primary,
  },
  errorMarker: {
    position: "absolute",
    top: "2px",
    width: "4px",
    height: "16px",
    backgroundColor: THEME.danger,
    borderRadius: "2px",
    cursor: "pointer",
    boxShadow: "0 0 5px rgba(239, 68, 68, 0.5)",
  },
  ambiguousMarker: {
    position: "absolute",
    top: "4px",
    width: "3px",
    height: "12px",
    backgroundColor: THEME.warning,
    borderRadius: "2px",
    cursor: "pointer",
    boxShadow: "0 0 4px rgba(245, 158, 11, 0.6)",
  },
  unresolvedMarker: {
    position: "absolute",
    top: "4px",
    width: "3px",
    height: "12px",
    backgroundColor: THEME.danger,
    borderRadius: "2px",
    cursor: "pointer",
    boxShadow: "0 0 4px rgba(239, 68, 68, 0.6)",
  },
  markerToggleRow: {
    marginTop: "8px",
    display: "flex",
    gap: "8px",
  },
  markerToggleBtn: (active, kind) => ({
    flex: 1,
    borderRadius: "20px",
    border: `1px solid ${active ? (kind === "ambiguous" ? THEME.warning : THEME.danger) : THEME.border}`,
    background: active
      ? (kind === "ambiguous" ? "rgba(245, 158, 11, 0.18)" : "rgba(239, 68, 68, 0.18)")
      : "rgba(255,255,255,0.03)",
    color: THEME.textMain,
    padding: "6px 10px",
    fontSize: "11px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    cursor: "pointer",
  }),
  markerDot: (color) => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 6px ${color}`,
  }),
  dockHintZone: (side, isActive) => ({
    position: "fixed",
    bottom: DEFAULT_BOTTOM_OFFSET,
    left: side === "left" ? 20 : "auto",
    right: side === "right" ? 20 : "auto",
    width: side === "left" ? "min(300px, calc(100vw - 40px))" : "min(320px, calc(100vw - 40px))",
    minHeight: "68px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: `1px dashed ${isActive ? THEME.primary : "rgba(255,255,255,0.22)"}`,
    background: isActive ? "rgba(99, 102, 241, 0.2)" : "rgba(255,255,255,0.06)",
    color: THEME.textMain,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    pointerEvents: "none",
    zIndex: 1900,
    boxShadow: isActive ? `0 0 0 1px ${THEME.primary}55` : "none",
    transition: "all 0.15s ease",
  }),
  dockHintLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.3px",
  },
  dockHintText: {
    fontSize: "10px",
    color: THEME.textMuted,
  },
  meta: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "11px",
    marginTop: "8px",
    fontFamily: "monospace",
  },
};

export default TracePlayer;
