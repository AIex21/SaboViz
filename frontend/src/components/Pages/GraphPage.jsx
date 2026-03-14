import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SaboGraph from "../Graph/SaboGraph";
import TracePlayer from "../Player/TracePlayer";
import { projectApi } from "../../api/project";
import { THEME } from "../../config/graphConfig";
import { useToast } from "../../context/ToastContext";

const BUFFER_SIZE = 100;

const elementKey = (el) => {
  if (!el?.data?.source) return `n:${String(el?.data?.id)}`;
  if (el.data.id != null && el.data.id !== "") return `e:${String(el.data.id)}`;
  return `e:${String(el.data.source)}->${String(el.data.target)}:${String(el.data.label || "")}`;
};

const mergeUniqueElements = (...lists) => {
  const merged = new Map();
  lists.flat().forEach((el) => {
    if (!el || !el.data) return;
    merged.set(elementKey(el), el);
  });
  return Array.from(merged.values());
};

const splitElements = (elements) => {
  const nodes = [];
  const edges = [];

  elements.forEach((el) => {
    if (el?.data?.source) edges.push(el);
    else nodes.push(el);
  });

  return { nodes, edges };
};

const isAggregatedEdge = (edge) => Boolean(edge?.data?.isAggregated || edge?.classes === "aggregated");

const sanitizeEdgesByPresentNodes = (elements) => {
  const { nodes, edges } = splitElements(elements);
  const nodeIds = new Set(nodes.map((n) => String(n.data.id)));

  const safeEdges = edges.filter((e) => {
    const src = String(e?.data?.source);
    const tgt = String(e?.data?.target);
    return nodeIds.has(src) && nodeIds.has(tgt);
  });

  return [...nodes, ...safeEdges];
};

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
  const [edgeFocusNodeIds, setEdgeFocusNodeIds] = useState(new Set());
  const [expandedNodeIds, setExpandedNodeIds] = useState(new Set());
  const [loadedParentIds, setLoadedParentIds] = useState(new Set());

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
  const nodePositionsRef = useRef({});

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

        setGraphElements(sanitizeEdgesByPresentNodes(mergeUniqueElements(initialElements)));
        setEdgeFocusNodeIds(new Set());
        setExpandedNodeIds(new Set());
        setLoadedParentIds(new Set());
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

  const formatNode = (node, fallbackPosition = null) => {
    const cachedPosition = nodePositionsRef.current[String(node.id)] || fallbackPosition;

    return {
      data: {
        id: node.id,
        parent: node.parent_id,
        properties: node.properties,
        ai_summary: node.ai_summary,
        simpleName: node.properties?.simpleName || node.id,
        label: node.labels ? node.labels[0] : "",
        hasChildren: node.hasChildren,
        expanded: expandedNodeIds.has(String(node.id)),
        participating_features: node.participating_features || []
      },
      ...(cachedPosition ? { position: cachedPosition } : {}),
      classes: node.labels ? node.labels[0] : "",
    };
  };

  const formatEdge = (edge) => ({
    data: {
      id: `e_${edge.db_id}`,
      source: edge.source_id,
      target: edge.target_id,
      label: edge.label,
    },
    classes: edge.label,
  });

  const handlePositionsSnapshot = (positionsById) => {
    nodePositionsRef.current = positionsById || {};
  };

  const getVisibleNodeIds = (elements, expandedSet) => {
    const { nodes } = splitElements(elements);
    const nodeById = new Map(nodes.map((n) => [String(n.data.id), n]));
    const visible = new Set();

    nodes.forEach((node) => {
      let currentParentId = node.data.parent != null ? String(node.data.parent) : null;
      let isVisible = true;

      while (currentParentId) {
        if (!expandedSet.has(currentParentId)) {
          isVisible = false;
          break;
        }

        const parentNode = nodeById.get(currentParentId);
        currentParentId = parentNode?.data?.parent != null ? String(parentNode.data.parent) : null;
      }

      if (isVisible) visible.add(String(node.data.id));
    });

    return visible;
  };

  const mergeAggregatedEdges = (elements, aggregatedEdges, allowedNodeIds = null) => {
    const withoutAggregated = elements.filter((el) => !(el.data.source && isAggregatedEdge(el)));
    const validAggregated = (aggregatedEdges || []).filter((edge) => {
      const src = String(edge?.data?.source);
      const tgt = String(edge?.data?.target);
      if (!src || !tgt || src === tgt) return false;
      if (!allowedNodeIds) return true;
      return allowedNodeIds.has(src) && allowedNodeIds.has(tgt);
    });

    return sanitizeEdgesByPresentNodes(mergeUniqueElements(withoutAggregated, validAggregated));
  };

  const getDescendantIds = (rootId, elements) => {
    const root = String(rootId);
    const descendants = new Set();
    const stack = [root];

    while (stack.length > 0) {
      const currentId = stack.pop();
      const children = elements.filter(el =>
        String(el.data.parent) === currentId && !descendants.has(String(el.data.id))
      );

      children.forEach(child => {
        const childId = String(child.data.id);
        descendants.add(childId);
        stack.push(childId);
      });
    }
    return descendants;
  }

  // Expansion Handler
  // This function is passed down to SaboGraph to be called on double-click
  const handleNodeExpand = async (nodeId) => {
    try {
      const nodeIdStr = String(nodeId);
      const targetNode = graphElements.find(el => !el.data.source && String(el.data.id) === nodeIdStr);
      if (!targetNode) return;

      const wasExpanded = expandedNodeIds.has(nodeIdStr);
      const nextExpanded = new Set(expandedNodeIds);

      if (wasExpanded) {
        nextExpanded.delete(nodeIdStr);

        // Cascade collapse: when a parent collapses, all its loaded descendants collapse too.
        const { nodes: allNodes } = splitElements(graphElements);
        const descendants = getDescendantIds(nodeIdStr, allNodes);
        descendants.forEach((descId) => {
          nextExpanded.delete(String(descId));
        });
      } else {
        nextExpanded.add(nodeIdStr);
      }

      let nextElements = graphElements;

      // Lazy-load children exactly once for each parent.
      if (!wasExpanded && !loadedParentIds.has(nodeIdStr)) {
        const childData = await projectApi.getChildren(projectId, nodeId);

        if (childData.nodes && childData.nodes.length > 0) {
          const parentPos = nodePositionsRef.current[nodeIdStr] || null;
          const allNodes = childData.nodes.map((n, index) => {
            const cachedPos = nodePositionsRef.current[String(n.id)];
            if (cachedPos) return formatNode(n, cachedPos);

            if (!parentPos) return formatNode(n);

            const idHash = Array.from(String(n.id)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
            const angle = (idHash % 360) * (Math.PI / 180);
            const radius = 110 + ((index % 6) * 28);

            return formatNode(n, {
              x: parentPos.x + Math.cos(angle) * radius,
              y: parentPos.y + Math.sin(angle) * radius,
            });
          });

          const newChildIds = new Set(allNodes.map((n) => String(n.data.id)));
          const allRealEdges = (childData.edges || [])
            .map((e) => formatEdge(e))
            .filter((edge) => {
              const src = String(edge.data.source);
              const tgt = String(edge.data.target);
              const isParentToChild = src === nodeIdStr && newChildIds.has(tgt);
              const isChildToParent = tgt === nodeIdStr && newChildIds.has(src);
              return !isParentToChild && !isChildToParent;
            });

          nextElements = mergeUniqueElements(nextElements, allNodes, allRealEdges);
        }

        setLoadedParentIds((prev) => {
          const next = new Set(prev);
          next.add(nodeIdStr);
          return next;
        });
      }

      // Keep expanded flag in node data as a style hint for container rendering.
      nextElements = nextElements.map((el) => {
        if (el.data.source) return el;
        const id = String(el.data.id);
        return {
          ...el,
          data: {
            ...el.data,
            expanded: nextExpanded.has(id),
          },
        };
      });

      setExpandedNodeIds(nextExpanded);

      const visibleNodeIdSet = getVisibleNodeIds(nextElements, nextExpanded);
      const visibleNodeIds = Array.from(visibleNodeIdSet);
      let reconciledElements = nextElements;

      if (visibleNodeIds.length > 0) {
        const aggData = await projectApi.getAggregatedEdges(projectId, visibleNodeIds);
        reconciledElements = mergeAggregatedEdges(nextElements, aggData.edges || [], visibleNodeIdSet);
      } else {
        reconciledElements = nextElements.filter((el) => !(el.data.source && isAggregatedEdge(el)));
      }

      setGraphElements(sanitizeEdgesByPresentNodes(reconciledElements));

    } catch (error) {
      console.error("Error expanding node:", error);
    }
  };

  const toggleLock = (nodeId) => {
    setLockedNodeIds(prev => {
      const next = new Set(prev);
      const nodeIdStr = String(nodeId);
      if (next.has(nodeIdStr)) {
        next.delete(nodeIdStr);
      } else {
        next.add(nodeIdStr);
      }
      return next;
    });
  };

  const toggleEdgeFocus = (nodeId) => {
    setEdgeFocusNodeIds((prev) => {
      const next = new Set(prev);
      const nodeIdStr = String(nodeId);
      if (next.has(nodeIdStr)) {
        next.delete(nodeIdStr);
      } else {
        next.add(nodeIdStr);
      }
      return next;
    });
  };

  const visibleElements = useMemo(() => {
    const { nodes, edges } = splitElements(graphElements);
    const visibleNodeIdSet = getVisibleNodeIds(graphElements, expandedNodeIds);

    let filteredNodes = nodes.filter((n) => visibleNodeIdSet.has(String(n.data.id)));
    let filteredEdges = edges.filter((e) => {
      const src = String(e.data.source);
      const tgt = String(e.data.target);
      return visibleNodeIdSet.has(src) && visibleNodeIdSet.has(tgt);
    });

    if (lockedNodeIds.size > 0) {
      const lockedScope = new Set();

      lockedNodeIds.forEach((rootId) => {
        const rootStr = String(rootId);
        lockedScope.add(rootStr);
        const descendants = getDescendantIds(rootStr, nodes);
        descendants.forEach((d) => lockedScope.add(String(d)));
      });

      // Keep all visible nodes, only constrain edges to the locked scope.
      filteredEdges = filteredEdges.filter((e) => {
        const src = String(e.data.source);
        const tgt = String(e.data.target);
        return lockedScope.has(src) && lockedScope.has(tgt);
      });
    }

    if (edgeFocusNodeIds.size > 0) {
      filteredEdges = filteredEdges.filter((e) => {
        const src = String(e.data.source);
        const tgt = String(e.data.target);
        return edgeFocusNodeIds.has(src) || edgeFocusNodeIds.has(tgt);
      });
    }

    return sanitizeEdgesByPresentNodes([...filteredNodes, ...filteredEdges]);
  }, [graphElements, expandedNodeIds, lockedNodeIds, edgeFocusNodeIds]);

  const lockedScopeIds = useMemo(() => {
    if (lockedNodeIds.size === 0) return new Set();

    const { nodes } = splitElements(graphElements);
    const scope = new Set();

    lockedNodeIds.forEach((rootId) => {
      const rootStr = String(rootId);
      scope.add(rootStr);
      const descendants = getDescendantIds(rootStr, nodes);
      descendants.forEach((d) => scope.add(String(d)));
    });

    return scope;
  }, [graphElements, lockedNodeIds]);

  const edgeFocusNeighborIds = useMemo(() => {
    if (edgeFocusNodeIds.size === 0) return new Set();

    const ids = new Set(edgeFocusNodeIds);
    visibleElements.forEach((el) => {
      if (!el.data.source) return;
      const src = String(el.data.source);
      const tgt = String(el.data.target);

      if (edgeFocusNodeIds.has(src) || edgeFocusNodeIds.has(tgt)) {
        ids.add(src);
        ids.add(tgt);
      }
    });

    return ids;
  }, [visibleElements, edgeFocusNodeIds]);

  // --- NEW: Calculate Stats Dynamically ---
    const stats = useMemo(() => {
      const nodes = visibleElements.filter(el => !el.data.source).length;
      const edges = visibleElements.length - nodes;
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

            {edgeFocusNodeIds.size > 0 && (
              <div style={styles.lockedBadge}>
                <span>↔ {edgeFocusNodeIds.size} Edge Focus</span>
                <button onClick={() => setEdgeFocusNodeIds(new Set())} style={styles.unlockBtn}>✕</button>
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
          onPositionsSnapshot={handlePositionsSnapshot}
          activeNodeId={activeTargetId}
          sourceNodeId={activeSourceId}
          currentAction={currentActionData}
          onToggleLock={toggleLock}
          lockedNodeIds={lockedNodeIds}
          lockedScopeIds={lockedScopeIds}
          onToggleEdgeFocus={toggleEdgeFocus}
          edgeFocusNodeIds={edgeFocusNodeIds}
          edgeFocusNeighborIds={edgeFocusNeighborIds}
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