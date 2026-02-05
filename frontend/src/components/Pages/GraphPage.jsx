import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SaboGraph from "../Graph/SaboGraph";
import TracePlayer from "../Player/TracePlayer";
import { projectApi } from "../../api/project";
import { THEME } from "../../config/graphConfig";
import { useToast } from "../../context/ToastContext";

const BUFFER_SIZE = 100;

function GraphPage() {
  const { showToast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const projectId = parseInt(id);

  const [graphElements, setGraphElements] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [projectName, setProjectName] = useState("Loading...");
  const [projectStatus, setProjectStatus] = useState("ready");
  const [lockedNodeIds, setLockedNodeIds] = useState(new Set());

  // Feature State
  const [features, setFeatures] = useState([]);
  const [activeFeatureIds, setActiveFeatureIds] = useState(new Set());

  // Trace State
  const [availableTraces, setAvailableTraces] = useState([]);
  const [traceDataMap, setTraceDataMap] = useState({});
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hierarchyMap, setHierarchyMap] = useState({});
  const isFetchingHierarchy = useRef(false);

  // Data Loading
  useEffect(() => {
    const loadRoots = async () => {
      setIsLoading(true);
      try {
        const [projectMeta, rootData, traces, featureList] = await Promise.all([
             projectApi.getProject(projectId),
             projectApi.getRoots(projectId),
             projectApi.getTraces(projectId),
             projectApi.getFeatures(projectId)
        ]);

        setProjectName(projectMeta.name);
        setProjectStatus(projectMeta.status);
        setAvailableTraces(traces);
        setFeatures(featureList);

        const cyNodes = rootData.nodes.map(n => formatNode(n));
        const cyEdges = rootData.edges.map(e => formatEdge(e));

        const visibleIds = cyNodes.map(n => n.data.id);

        let initialElements = [...cyNodes, ...cyEdges];

        if (visibleIds.length > 0) {
          const aggData = await projectApi.getAggregatedEdges(projectId, visibleIds);
          if (aggData.edges) {
            initialElements = [...initialElements, ...aggData.edges];
          }
        }

        setGraphElements(initialElements);
      } catch (error) {
        console.error("Error loading graph data:", error);
        setProjectName("Error Loading Project");
        showToast("Failed to load project data", "error");
      } finally {
        setIsLoading(false);
      }
    };

    loadRoots();
  }, [projectId, showToast]);

  const handleFeatureToggle = (featureId) => {
    setActiveFeatureIds(prev => {
      const next = new Set(prev);
      if (next.has(featureId)) {
        next.delete(featureId);
      } else {
        next.add(featureId);
      }
      return next;
    })
  }

  const handleSelectTrace = async (traceIdStr) => {
    const traceId = parseInt(traceIdStr);
    if (!traceId) {
      setSelectedTraceId("");
      setCurrentStepIndex(0);
      return;
    }

    setSelectedTraceId(traceId);
    setCurrentStepIndex(0);

    if (!traceDataMap[traceId]) {
      try {
        const fullContent = await projectApi.getTraceFile(traceId);
        setTraceDataMap(prev => ({ ...prev, [traceId]: fullContent }) );
      } catch (error) {
        console.error("Failed to load trace file:", error);
        showToast("Failed to load trace data", "error");
      }
    }
  };

  const traceSteps = useMemo(() => {
    if (!selectedTraceId || !traceDataMap[selectedTraceId]) return [];

    const rawData = traceDataMap[selectedTraceId];
    // Safety check in case the file format is slightly different
    const nodes = rawData.elements?.nodes || [];
    const actionNodes = nodes.filter((n) => n.data.labels && n.data.labels.includes("Action"));
    
    return actionNodes.sort((a, b) => a.data.properties.step - b.data.properties.step);
  }, [selectedTraceId, traceDataMap]);

  const failureIndices = useMemo(() => {
    return traceSteps
      .map((step, index) => {
        const msg = step.data.properties.message || "";
        if (msg.includes("FAIL") || msg.includes("ERROR")) {
          return index;
        }
        return -1;
      })
      .filter((idx) => idx !== -1);
  }, [traceSteps]);
  
  useEffect(() => {
    if (!traceSteps || traceSteps.length === 0) return;

    const bufferHierarchy = async () => {
      if (isFetchingHierarchy.current) return;
      const endStep = Math.min(currentStepIndex + BUFFER_SIZE, traceSteps.length);
      const upcomingSteps = traceSteps.slice(currentStepIndex, endStep);
      const missingIds = new Set();

      upcomingSteps.forEach(step => {
        const props = step.data.properties;
        const sourceId = props.sourceId;
        const targetId = props.targetId;

        if (sourceId && !hierarchyMap[sourceId]) {
          missingIds.add(sourceId);
        }
        if (targetId && !hierarchyMap[targetId]) {
          missingIds.add(targetId);
        }
      });

      if (missingIds.size > 0) {
        isFetchingHierarchy.current = true;
        try {
          const newHierarchy = await projectApi.getHierarchy(projectId, Array.from(missingIds));
          setHierarchyMap(prev => ({ ...prev, ...newHierarchy }));
        } catch (error) {
          console.error("Hierarchy buffer failed", error);
          showToast("Failed to buffer hierarchy data", "error");
        } finally {
          isFetchingHierarchy.current = false;
        }
      }
    };
    bufferHierarchy();
  }, [currentStepIndex, traceSteps, hierarchyMap, projectId]);

  const formatNode = (node) => ({
    data: {
      id: node.id,
      parent: node.parent_id,
      properties: node.properties,
      simpleName: node.properties?.simpleName || node.id,
      label: node.labels ? node.labels[0] : "",
      hasChildren: node.hasChildren,
      participating_features: node.participating_features || []
    },
    classes: node.labels ? node.labels[0] : "",
  });

  const formatEdge = (edge) => ({
    data: {
      id: `e_${edge.db_id}`,
      source: edge.source_id,
      target: edge.target_id,
      label: edge.label,
    },
    classes: edge.label,
  });

  const getDescendantIds = (rootId, elements) => {
    const descendants = new Set();
    const stack = [rootId];

    while (stack.length > 0) {
      const currentId = stack.pop();
      const children = elements.filter(el =>
        el.data.parent === currentId && !descendants.has(el.data.id)
      );

      children.forEach(child => {
        descendants.add(child.data.id);
        stack.push(child.data.id);
      });
    }
    return descendants;
  }

  // Expansion Handler
  // This function is passed down to SaboGraph to be called on double-click
  const handleNodeExpand = async (nodeId) => {
    try {
      const targetNode = graphElements.find(el => el.data.id === nodeId);
      if (!targetNode) return;

      // ==========================================
      // 1. COLLAPSE LOGIC
      // ==========================================
      if (targetNode.data.expanded) {
        const idsToRemove = getDescendantIds(nodeId, graphElements);
        
        // Remove descendants and edges connected to them
        const nextElements = graphElements.filter(el => {
          if (idsToRemove.has(el.data.id)) return false;
          if (el.data.source && (idsToRemove.has(el.data.source) || idsToRemove.has(el.data.target))) return false;
          return true;
        }).map(el =>
          el.data.id === nodeId ? {
            ...el,
            data: { ...el.data, expanded: false}
          } : el);

        const newVisibleIds = nextElements.filter(el => !el.data.source).map(el => el.data.id);
        const aggData = await projectApi.getAggregatedEdges(projectId, newVisibleIds);

        // Filter Aggregates (Simple check: no self-loops)
        // We don't check 'newChildIds' here because we aren't adding any.
        const validAggregates = (aggData.edges || []).filter(edge => 
             String(edge.data.source) !== String(edge.data.target)
        );

        const finalElements = [
          ...nextElements.filter(el => !el.data.isAggregated),
          ...validAggregates
        ];

        setGraphElements(finalElements);
        return;
      }

      // ==========================================
      // 2. EXPAND LOGIC
      // ==========================================
      const childData = await projectApi.getChildren(projectId, nodeId);

      if (!childData.nodes || childData.nodes.length === 0) return;

      // A. Define Nodes & IDs FIRST (so we can use them in filters)
      const allNodes = childData.nodes.map(n => formatNode(n));
      const newChildIds = allNodes.map(n => n.data.id); 

      // B. Filter Real Edges (Structural)
      // Hide edges connecting the Parent to its new Children (Vertical noise)
      const allRealEdges = (childData.edges || []).map(e => formatEdge(e)).filter(edge => {
          const src = String(edge.data.source);
          const tgt = String(edge.data.target);
          const parentId = String(nodeId);

          const isParentToChild = (src === parentId && newChildIds.includes(tgt));
          const isChildToParent = (tgt === parentId && newChildIds.includes(src));

          if (isParentToChild || isChildToParent) return false;
          return true;
      });

      // C. Fetch & Filter Aggregated Edges
      const currentVisibleIds = graphElements.filter(el => !el.data.source).map(el => el.data.id);
      const combinedVisibleIds = [...currentVisibleIds, ...newChildIds];
      const aggData = await projectApi.getAggregatedEdges(projectId, combinedVisibleIds);

      const validAggregates = (aggData.edges || []).filter(edge => {
          const src = String(edge.data.source);
          const tgt = String(edge.data.target);
          const parentId = String(nodeId);

          // No Self Loops
          if (src === tgt) return false;

          // No Vertical Aggregates (Parent <-> New Child)
          const isParentToChild = (src === parentId && newChildIds.includes(tgt));
          const isChildToParent = (tgt === parentId && newChildIds.includes(src));

          if (isParentToChild || isChildToParent) return false;

          return true;
      });

      // D. Update State
      setGraphElements(prevElements => {
        const updatedPrevElements = prevElements.map(el =>
          el.data.id === nodeId
          ? { ...el, data: { ...el.data, expanded: true }}
          : el
        );

        const cleanPrevElements = updatedPrevElements.filter(el => !el.data.isAggregated);

        return [
          ...cleanPrevElements,
          ...allNodes,
          ...allRealEdges,
          ...validAggregates
        ];
      })

    } catch (error) {
      console.error("Error expanding node:", error);
    }
  };

  const toggleLock = (nodeId) => {
    setLockedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const visibleElements = useMemo(() => {
    if (lockedNodeIds.size === 0) return graphElements;

    const lockedScope = new Set();

    lockedNodeIds.forEach(rootId => {
      lockedScope.add(rootId);
      const descendants = getDescendantIds(rootId, graphElements);
      descendants.forEach(d => lockedScope.add(d));
    });

    return graphElements.filter(el => {
      if (!el.data.source) return true;
      return lockedScope.has(el.data.source) && lockedScope.has(el.data.target);
    });
  }, [graphElements, lockedNodeIds]);

  // --- NEW: Calculate Stats Dynamically ---
  const stats = useMemo(() => {
      const nodes = graphElements.filter(el => !el.data.source).length;
      const edges = graphElements.length - nodes;
      return { nodes, edges };
  }, [visibleElements]);

  const graphData = useMemo(() => ({ elements: visibleElements }), [visibleElements]);

  const { activeTargetId, activeSourceId, currentActionData } = useMemo(() => {
    if (!traceSteps.length) {
      return { activeTargetId: null, activeSourceId: null, currentActionData: null };
    }

    const safeIndex = Math.min(currentStepIndex, traceSteps.length - 1);
    const step = traceSteps[safeIndex];

    return step ? {
      activeTargetId: step.data.properties.targetId,
      activeSourceId: step.data.properties.sourceId,
      currentActionData: step.data.properties,
    } : {};
  }, [traceSteps, currentStepIndex]);

  const currentTraceObj = availableTraces.find(t => t.id === selectedTraceId);

  return (
    <div style={styles.container}>
      
      {/* --- HEADER --- */}
      <div style={styles.header}>
        <div style={styles.leftGroup}>
            <button onClick={() => navigate('/')} style={styles.backBtn} title="Back to Dashboard">
                ←
            </button>
            <div style={styles.divider}></div>
            <div>
                <h2 style={styles.projectName}>{projectName}</h2>
            </div>

            {lockedNodeIds.size > 0 && (
              <div style={styles.lockedBadge}>
                <span>🔒 {lockedNodeIds.size} Focused</span>
                <button onClick={() => setLockedNodeIds(new Set())} style={styles.unlockBtn}>✕</button>
              </div>
            )}
        </div>
        
        {/* --- RIGHT SIDE: STATS --- */}
        <div style={styles.rightGroup}>
            <div style={styles.statItem}>
                <span style={styles.statValue}>{stats.nodes}</span>
                <span style={styles.statLabel}>NODES</span>
            </div>
            <div style={styles.dividerSmall}></div>
            <div style={styles.statItem}>
                <span style={styles.statValue}>{stats.edges}</span>
                <span style={styles.statLabel}>EDGES</span>
            </div>
        </div>
      </div>

      {/* --- GRAPH CANVAS --- */}
      <div style={styles.graphWrapper}>
        {isLoading && (
          <div style={styles.loadingOverlay}>
             <div style={styles.spinner}></div>
             <span style={{marginTop: '15px', fontWeight: 500}}>Loading Graph Data...</span>
          </div>
        )}

        <SaboGraph
          data={graphData}
          onToggleExpand={handleNodeExpand}
          activeNodeId={activeTargetId}
          sourceNodeId={activeSourceId}
          currentAction={currentActionData}
          onToggleLock={toggleLock}
          lockedNodeIds={lockedNodeIds}
          hierarchyMap={hierarchyMap}
          features={features}
          activeFeatureIds={activeFeatureIds}
          onFeatureToggle={handleFeatureToggle}
          isDecomposing={projectStatus === 'decomposing'}
        />
      </div>

      <TracePlayer
        traces={availableTraces}
        currentTrace={currentTraceObj}
        onSelectTrace={handleSelectTrace}
        currentStep={currentStepIndex}
        totalSteps={traceSteps.length}
        onStepChange={setCurrentStepIndex}
        failureIndices={failureIndices}
      />
    </div>
  );
}

// --- STYLES ---
const styles = {
  container: {
    display: "flex", flexDirection: "column", height: "100vh",
    backgroundColor: THEME.bg, color: THEME.textMain, overflow: 'hidden'
  },
  header: {
    height: '60px', backgroundColor: THEME.panelBg, borderBottom: `1px solid ${THEME.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', zIndex: 10
  },
  leftGroup: { display: 'flex', alignItems: 'center', gap: '15px' },
  backBtn: {
      background: 'transparent', border: `1px solid ${THEME.border}`, 
      color: THEME.textMuted, width: '32px', height: '32px', borderRadius: '8px',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '18px', transition: 'all 0.2s',
      ':hover': { background: THEME.bg, color: THEME.textMain }
  },
  divider: { width: '1px', height: '24px', background: THEME.border },
  projectName: { fontSize: '16px', fontWeight: 700, margin: 0, color: '#fff' },
  
  // New Stats Styles
  rightGroup: { display: 'flex', alignItems: 'center', gap: '12px' },
  statItem: { display: 'flex', alignItems: 'baseline', gap: '6px' },
  statValue: { fontSize: '14px', fontWeight: 700, color: '#fff', fontFamily: 'monospace' },
  statLabel: { fontSize: '10px', fontWeight: 600, color: '#666', letterSpacing: '0.5px' },
  dividerSmall: { width: '1px', height: '14px', background: '#444' },

  graphWrapper: { flex: 1, position: 'relative', backgroundColor: THEME.bg },
  loadingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(18, 18, 18, 0.8)", backdropFilter: 'blur(4px)',
    color: "white", display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  spinner: {
      width: '40px', height: '40px', borderRadius: '50%',
      border: `3px solid rgba(255,255,255,0.1)`, borderTop: `3px solid ${THEME.primary}`,
      animation: 'spin 1s linear infinite'
  },
  lockedBadge: {
      display: 'flex', alignItems: 'center', gap: '8px',
      backgroundColor: 'rgba(139, 92, 246, 0.2)', 
      border: `1px solid ${THEME.primary}`,
      padding: '4px 8px', borderRadius: '6px', marginLeft: '15px',
      color: '#fff', fontSize: '12px', fontWeight: 600,
      animation: 'fadeIn 0.3s ease'
  },
  unlockBtn: {
      background: 'transparent', border: 'none', color: '#fff',
      cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
      padding: '0 4px', display: 'flex', alignItems: 'center'
  }
};
export default GraphPage;