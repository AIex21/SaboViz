import React, { useState, useEffect, useMemo } from "react";
import { THEME } from "../../config/graphConfig";

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
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showAmbiguousMarkers, setShowAmbiguousMarkers] = useState(false);
  const [showUnresolvedMarkers, setShowUnresolvedMarkers] = useState(false);

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

  return (
    <div style={styles.container(isCollapsed)}>
      {/* Header / Collapse Bar */}
      <div style={styles.header} onClick={() => setIsCollapsed(!isCollapsed)}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={styles.indicator}>●</span>
          <span style={styles.title}>Trace Replay</span>
          {currentTrace && (
            <span style={styles.traceName}>/ {currentTrace.name}</span>
          )}
        </div>
        <button style={styles.collapseBtn}>{isCollapsed ? "▲" : "▼"}</button>
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
  );
};

// Styles
const styles = {
  container: (collapsed) => ({
    position: "fixed",
    bottom: 30,
    left: "50%",
    transform: "translateX(-50%)",
    width: "500px",
    backgroundColor: "rgba(30, 30, 30, 0.95)",
    backdropFilter: "blur(10px)",
    borderRadius: "16px",
    border: `1px solid ${THEME.border}`,
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    zIndex: 2000,
    overflow: "hidden",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  }),
  header: {
    padding: "12px 20px",
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    borderBottom: `1px solid ${THEME.border}`,
  },
  indicator: { color: THEME.success, fontSize: "10px" },
  title: { fontSize: "13px", fontWeight: 600, color: THEME.textMain },
  traceName: { fontSize: "13px", color: THEME.textMuted },
  collapseBtn: {
    background: "none",
    border: "none",
    color: THEME.textMuted,
    cursor: "pointer",
  },

  body: { padding: "20px" },
  select: {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "20px",
    background: THEME.bg,
    border: `1px solid ${THEME.border}`,
    color: THEME.textMain,
    outline: "none",
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  traceFilterRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "12px",
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
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    ":hover": { background: "#333" },
  },
  playBtn: {
    padding: "8px 24px",
    borderRadius: "30px",
    background: THEME.primary,
    color: "white",
    border: "none",
    fontWeight: 700,
    fontSize: "12px",
    letterSpacing: "1px",
    cursor: "pointer",
    boxShadow: `0 4px 15px ${THEME.primary}40`,
  },
  playBtnActive: {
    padding: "8px 24px",
    borderRadius: "30px",
    background: "#333",
    color: "#fff",
    border: "1px solid #555",
    fontWeight: 700,
    fontSize: "12px",
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
    marginTop: "10px",
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
  meta: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "11px",
    marginTop: "5px",
    fontFamily: "monospace",
  },
};

export default TracePlayer;
