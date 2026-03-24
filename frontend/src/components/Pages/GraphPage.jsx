import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SaboGraph from "../Graph/SaboGraph";
import TracePlayer from "../Player/TracePlayer";
import { projectApi } from "../../api/project";
import { THEME } from "../../config/graphConfig";
import { useToast } from "../../context/ToastContext";

const BUFFER_SIZE = 100;
const ROOT_AGGREGATE_BUCKET_ID = "__agg_root__";

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
  const [revealedAggregatedNodeIds, setRevealedAggregatedNodeIds] = useState(new Set());
  const [shownAggregatedMemberDeps, setShownAggregatedMemberDeps] = useState({});
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
        setRevealedAggregatedNodeIds(new Set());
        setShownAggregatedMemberDeps({});
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

  useEffect(() => {
    if (projectStatus !== 'summarizing') return;

    const intervalId = setInterval(async () => {
      try {
        const projectMeta = await projectApi.getProject(projectId);
        setProjectStatus(projectMeta.status);
      } catch (error) {
        // Polling failure should not disrupt graph interactions.
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [projectId, projectStatus]);

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

  useEffect(() => {
    if (lockedNodeIds.size === 0 && revealedAggregatedNodeIds.size > 0) {
      setRevealedAggregatedNodeIds(new Set());
    }
    if (lockedNodeIds.size === 0) {
      setShownAggregatedMemberDeps({});
    }
  }, [lockedNodeIds, revealedAggregatedNodeIds]);

  const handleRevealAggregatedMember = (memberId) => {
    const memberIdStr = String(memberId);
    setRevealedAggregatedNodeIds((prev) => {
      const next = new Set(prev);
      next.add(memberIdStr);
      return next;
    });

    setShownAggregatedMemberDeps((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.endsWith(`::${memberIdStr}`)) {
          delete next[key];
        }
      });
      return next;
    });
  };

  const handleRevealAggregatedMemberDependencies = (aggregateNodeId, memberId, lockedEdgesByNeighbor = {}) => {
    const aggregateNodeIdStr = String(aggregateNodeId || "");
    const memberIdStr = String(memberId || "");
    if (!aggregateNodeIdStr || !memberIdStr) return;

    const key = `${aggregateNodeIdStr}::${memberIdStr}`;

    setShownAggregatedMemberDeps((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        return next;
      }

      next[key] = {
        aggregateNodeId: aggregateNodeIdStr,
        memberId: memberIdStr,
        lockedEdgesByNeighbor: lockedEdgesByNeighbor || {},
      };
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

      const keptNodes = [];
      const aggregatedMembers = [];
      const visibleNodeById = new Map(filteredNodes.map((n) => [String(n.data.id), n]));

      const resolveAggregateBucketId = (node) => {
        let parentId = node?.data?.parent != null ? String(node.data.parent) : null;

        while (parentId) {
          if (expandedNodeIds.has(parentId) && !lockedScope.has(parentId)) {
            return `__agg_parent__${parentId}`;
          }

          const parentNode = visibleNodeById.get(parentId);
          parentId = parentNode?.data?.parent != null ? String(parentNode.data.parent) : null;
        }

        return ROOT_AGGREGATE_BUCKET_ID;
      };

      filteredNodes.forEach((node) => {
        const nodeId = String(node.data.id);
        const keepAsRealNode =
          lockedScope.has(nodeId) ||
          expandedNodeIds.has(nodeId) ||
          revealedAggregatedNodeIds.has(nodeId);

        if (keepAsRealNode) keptNodes.push(node);
        else aggregatedMembers.push(node);
      });

      const keptNodeIdSet = new Set(keptNodes.map((n) => String(n.data.id)));
      const aggregatedMemberById = new Map();
      const membersByBucket = new Map();

      aggregatedMembers.forEach((member) => {
        const memberId = String(member.data.id);
        const bucketId = resolveAggregateBucketId(member);

        aggregatedMemberById.set(memberId, {
          node: member,
          bucketId,
        });

        if (!membersByBucket.has(bucketId)) {
          membersByBucket.set(bucketId, []);
        }

        membersByBucket.get(bucketId).push(member);
      });

      const promotedSingletonNodes = [];
      membersByBucket.forEach((bucketMembers, bucketId) => {
        if (bucketMembers.length !== 1) return;

        const singleton = bucketMembers[0];
        const singletonId = String(singleton.data.id);

        aggregatedMemberById.delete(singletonId);
        keptNodeIdSet.add(singletonId);
        promotedSingletonNodes.push(singleton);

        membersByBucket.delete(bucketId);
      });

      const keptEdges = [];

      filteredEdges.forEach((edge) => {
        const src = String(edge.data.source);
        const tgt = String(edge.data.target);
        const edgeLabel = String(edge.data.label || "related");

        const srcMemberMeta = aggregatedMemberById.get(src);
        const tgtMemberMeta = aggregatedMemberById.get(tgt);
        const srcIsMember = Boolean(srcMemberMeta);
        const tgtIsMember = Boolean(tgtMemberMeta);

        if (!srcIsMember && !tgtIsMember) {
          if (keptNodeIdSet.has(src) && keptNodeIdSet.has(tgt)) {
            if (lockedScope.has(src) || lockedScope.has(tgt)) {
              keptEdges.push(edge);
            }
          }
          return;
        }

        if (srcIsMember && tgtIsMember) {
          return;
        }
      });

      filteredNodes = keptNodes;
      if (promotedSingletonNodes.length > 0) {
        filteredNodes = mergeUniqueElements(filteredNodes, promotedSingletonNodes).filter((el) => !el?.data?.source);
      }
      filteredEdges = keptEdges;

      if (aggregatedMembers.length > 0) {
        const lockedScopeIdsList = Array.from(lockedScope);

        membersByBucket.forEach((bucketMembers, bucketId) => {
          const aggregateMembersInfo = bucketMembers.map((member) => {
            const memberId = String(member.data.id);

            const lockedNeighborIds = new Set();
            const lockedEdgeBreakdown = {};
            const lockedEdgesByNeighbor = {};

            let lockedEdgeCount = 0;

            const addEdgeStats = (neighborId, kind, qty) => {
              const safeNeighborId = String(neighborId);
              const safeKind = String(kind || "related");
              const safeQty = Number(qty) || 0;
              if (safeQty <= 0) return;

              lockedEdgeBreakdown[safeKind] = (lockedEdgeBreakdown[safeKind] || 0) + safeQty;
              lockedEdgeCount += safeQty;

              if (!lockedEdgesByNeighbor[safeNeighborId]) {
                lockedEdgesByNeighbor[safeNeighborId] = {};
              }
              lockedEdgesByNeighbor[safeNeighborId][safeKind] =
                (lockedEdgesByNeighbor[safeNeighborId][safeKind] || 0) + safeQty;
            };

            edges.forEach((e) => {
              const src = String(e.data.source);
              const tgt = String(e.data.target);

              const memberToLocked = src === memberId && lockedScope.has(tgt);
              const lockedToMember = tgt === memberId && lockedScope.has(src);
              if (!memberToLocked && !lockedToMember) return;

              const lockedNeighborId = memberToLocked ? tgt : src;
              lockedNeighborIds.add(lockedNeighborId);

              if (isAggregatedEdge(e)) {
                const weight = Number(e?.data?.weight) || 0;
                const breakdown = e?.data?.breakdown && typeof e.data.breakdown === "object"
                  ? e.data.breakdown
                  : {};

                if (Object.keys(breakdown).length > 0) {
                  Object.entries(breakdown).forEach(([kind, value]) => {
                    const qty = Number(value) || 0;
                    addEdgeStats(lockedNeighborId, kind, qty);
                  });
                  return;
                }

                const fallbackLabel = String(e.data.label || "aggregated");
                const fallbackQty = weight > 0 ? weight : 1;
                addEdgeStats(lockedNeighborId, fallbackLabel, fallbackQty);
                return;
              }

              const label = String(e.data.label || "related");
              addEdgeStats(lockedNeighborId, label, 1);
            });

            const connectedToLocked = lockedEdgeCount > 0;

            return {
              id: memberId,
              simpleName: member.data.simpleName || memberId,
              type: member.data.label || "Unknown",
              hasEdgeWithLocked: connectedToLocked,
              lockedEdgeCount,
              lockedNeighborIds: Array.from(lockedNeighborIds),
              lockedEdgeBreakdown,
              lockedEdgesByNeighbor,
              depsShown: Boolean(shownAggregatedMemberDeps[`${bucketId}::${memberId}`]),
            };
          });

          const knownPositions = bucketMembers
            .map((node) => nodePositionsRef.current[String(node.data.id)] || node.position)
            .filter(Boolean);

          let aggregatePosition = null;
          if (knownPositions.length > 0) {
            const sum = knownPositions.reduce(
              (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
              { x: 0, y: 0 }
            );

            aggregatePosition = {
              x: sum.x / knownPositions.length,
              y: sum.y / knownPositions.length,
            };
          } else if (bucketId.startsWith("__agg_parent__")) {
            const parentId = bucketId.replace("__agg_parent__", "");
            const parentNode = nodes.find((n) => String(n.data.id) === parentId);
            const parentPos =
              nodePositionsRef.current[String(parentNode?.data?.id)] ||
              parentNode?.position ||
              { x: 0, y: 0 };

            aggregatePosition = {
              x: parentPos.x + 170,
              y: parentPos.y + 70,
            };
          } else if (lockedScopeIdsList.length > 0) {
            const lockAnchor = nodes.find((n) => String(n.data.id) === lockedScopeIdsList[0]);
            const lockPos =
              nodePositionsRef.current[String(lockAnchor?.data?.id)] ||
              lockAnchor?.position ||
              { x: 0, y: 0 };

            aggregatePosition = {
              x: lockPos.x + 260,
              y: lockPos.y,
            };
          }

          const isParentScopedBucket = bucketId.startsWith("__agg_parent__");
          const aggregateDisplayName = isParentScopedBucket
            ? `aggregated (${bucketMembers.length})`
            : `aggregated-outside (${bucketMembers.length})`;

          filteredNodes.push({
            data: {
              id: bucketId,
              parent: isParentScopedBucket
                ? bucketId.replace("__agg_parent__", "")
                : null,
              simpleName: aggregateDisplayName,
              label: "Aggregated",
              isAggregated: true,
              isAggregateNode: true,
              weight: bucketMembers.length,
              aggregateMembers: aggregateMembersInfo,
              aggregateParentId: isParentScopedBucket
                ? bucketId.replace("__agg_parent__", "")
                : null,
            },
            ...(aggregatePosition ? { position: aggregatePosition } : {}),
            classes: "AggregatedNode",
          });
        });

        // Do not draw synthetic aggregate edges in lock mode.
        // Dependencies are shown in aggregate-member details and can be revealed on demand.

        const aggregateNodeIds = new Set(
          filteredNodes
            .filter((n) => n?.data?.isAggregateNode)
            .map((n) => String(n.data.id))
        );

        const revealedDepEdges = [];
        Object.values(shownAggregatedMemberDeps).forEach((entry) => {
          const aggregateNodeId = String(entry?.aggregateNodeId || "");
          const memberId = String(entry?.memberId || "");
          if (!aggregateNodeIds.has(aggregateNodeId)) return;

          const memberMeta = aggregatedMemberById.get(memberId);
          if (!memberMeta || memberMeta.bucketId !== aggregateNodeId) return;

          const byNeighbor = entry?.lockedEdgesByNeighbor || {};
          Object.entries(byNeighbor).forEach(([neighborIdRaw, breakdownRaw]) => {
            const neighborId = String(neighborIdRaw);
            if (!keptNodeIdSet.has(neighborId) || !lockedScope.has(neighborId)) return;

            const breakdown =
              breakdownRaw && typeof breakdownRaw === "object" ? breakdownRaw : {};
            const weight = Object.values(breakdown).reduce((sum, value) => sum + (Number(value) || 0), 0);
            if (weight <= 0) return;

            revealedDepEdges.push({
              data: {
                id: `agg_member_dep_${aggregateNodeId}_${memberId}_${neighborId}`,
                source: aggregateNodeId,
                target: neighborId,
                label: "aggregated",
                isAggregated: true,
                weight,
                breakdown,
                memberId,
                isRevealedDependency: true,
              },
              classes: "aggregated",
            });
          });
        });

        if (revealedDepEdges.length > 0) {
          filteredEdges = mergeUniqueElements(filteredEdges, revealedDepEdges).filter((el) => Boolean(el?.data?.source));
        }
      }
    } else if (activeFeatureIds.size > 0) {
      const visibleNodeById = new Map(filteredNodes.map((n) => [String(n.data.id), n]));
      const featureScope = new Set();

      filteredNodes.forEach((node) => {
        const nodeId = String(node.data.id);
        const featureIds = Array.isArray(node?.data?.participating_features)
          ? node.data.participating_features
          : [];

        const inActiveFeature = featureIds.some((fid) => activeFeatureIds.has(fid));
        if (!inActiveFeature) return;

        featureScope.add(nodeId);

        let parentId = node?.data?.parent != null ? String(node.data.parent) : null;
        while (parentId) {
          featureScope.add(parentId);
          const parentNode = visibleNodeById.get(parentId);
          parentId = parentNode?.data?.parent != null ? String(parentNode.data.parent) : null;
        }
      });

      const keptNodes = [];
      const aggregatedMembers = [];

      filteredNodes.forEach((node) => {
        const nodeId = String(node.data.id);
        const keepAsRealNode =
          featureScope.has(nodeId) ||
          revealedAggregatedNodeIds.has(nodeId) ||
          (expandedNodeIds.has(nodeId) && Boolean(node?.data?.hasChildren));

        if (keepAsRealNode) keptNodes.push(node);
        else aggregatedMembers.push(node);
      });

      const keptNodeIdSet = new Set(keptNodes.map((n) => String(n.data.id)));
      const aggregatedMemberById = new Map();
      const membersByBucket = new Map();

      const resolveAggregateBucketId = (node) => {
        let parentId = node?.data?.parent != null ? String(node.data.parent) : null;

        while (parentId) {
          if (expandedNodeIds.has(parentId) && keptNodeIdSet.has(parentId)) {
            return `__agg_parent__${parentId}`;
          }

          const parentNode = visibleNodeById.get(parentId);
          parentId = parentNode?.data?.parent != null ? String(parentNode.data.parent) : null;
        }

        return ROOT_AGGREGATE_BUCKET_ID;
      };

      aggregatedMembers.forEach((member) => {
        const memberId = String(member.data.id);
        const bucketId = resolveAggregateBucketId(member);

        aggregatedMemberById.set(memberId, {
          node: member,
          bucketId,
        });

        if (!membersByBucket.has(bucketId)) membersByBucket.set(bucketId, []);
        membersByBucket.get(bucketId).push(member);
      });

      const promotedSingletonNodes = [];
      membersByBucket.forEach((bucketMembers, bucketId) => {
        if (bucketMembers.length !== 1) return;
        const singleton = bucketMembers[0];
        const singletonId = String(singleton.data.id);
        aggregatedMemberById.delete(singletonId);
        keptNodeIdSet.add(singletonId);
        promotedSingletonNodes.push(singleton);
        membersByBucket.delete(bucketId);
      });

      const keptEdges = filteredEdges.filter((edge) => {
        const src = String(edge.data.source);
        const tgt = String(edge.data.target);
        if (!keptNodeIdSet.has(src) || !keptNodeIdSet.has(tgt)) return false;
        return featureScope.has(src) || featureScope.has(tgt);
      });

      filteredNodes = keptNodes;
      if (promotedSingletonNodes.length > 0) {
        filteredNodes = mergeUniqueElements(filteredNodes, promotedSingletonNodes).filter((el) => !el?.data?.source);
      }
      filteredEdges = keptEdges;

      if (aggregatedMembers.length > 0) {
        membersByBucket.forEach((bucketMembers, bucketId) => {
          if (bucketMembers.length < 2) return;

          const aggregateMembersInfo = bucketMembers.map((member) => {
            const memberId = String(member.data.id);
            const featureNeighborIds = new Set();
            const featureEdgeBreakdown = {};
            const featureEdgesByNeighbor = {};
            let featureEdgeCount = 0;

            const addEdgeStats = (neighborId, kind, qty) => {
              const safeNeighborId = String(neighborId);
              const safeKind = String(kind || "related");
              const safeQty = Number(qty) || 0;
              if (safeQty <= 0) return;

              featureEdgeBreakdown[safeKind] = (featureEdgeBreakdown[safeKind] || 0) + safeQty;
              featureEdgeCount += safeQty;

              if (!featureEdgesByNeighbor[safeNeighborId]) {
                featureEdgesByNeighbor[safeNeighborId] = {};
              }
              featureEdgesByNeighbor[safeNeighborId][safeKind] =
                (featureEdgesByNeighbor[safeNeighborId][safeKind] || 0) + safeQty;
            };

            edges.forEach((e) => {
              const src = String(e.data.source);
              const tgt = String(e.data.target);

              const memberToFeature = src === memberId && featureScope.has(tgt);
              const featureToMember = tgt === memberId && featureScope.has(src);
              if (!memberToFeature && !featureToMember) return;

              const featureNeighborId = memberToFeature ? tgt : src;
              featureNeighborIds.add(featureNeighborId);

              if (isAggregatedEdge(e)) {
                const weight = Number(e?.data?.weight) || 0;
                const breakdown = e?.data?.breakdown && typeof e.data.breakdown === "object"
                  ? e.data.breakdown
                  : {};

                if (Object.keys(breakdown).length > 0) {
                  Object.entries(breakdown).forEach(([kind, value]) => {
                    const qty = Number(value) || 0;
                    addEdgeStats(featureNeighborId, kind, qty);
                  });
                  return;
                }

                const fallbackLabel = String(e.data.label || "aggregated");
                const fallbackQty = weight > 0 ? weight : 1;
                addEdgeStats(featureNeighborId, fallbackLabel, fallbackQty);
                return;
              }

              const label = String(e.data.label || "related");
              addEdgeStats(featureNeighborId, label, 1);
            });

            return {
              id: memberId,
              simpleName: member.data.simpleName || memberId,
              type: member.data.label || "Unknown",
              hasEdgeWithLocked: featureEdgeCount > 0,
              lockedEdgeCount: featureEdgeCount,
              lockedNeighborIds: Array.from(featureNeighborIds),
              lockedEdgeBreakdown: featureEdgeBreakdown,
              lockedEdgesByNeighbor: featureEdgesByNeighbor,
              depsShown: Boolean(shownAggregatedMemberDeps[`${bucketId}::${memberId}`]),
            };
          });

          const knownPositions = bucketMembers
            .map((node) => nodePositionsRef.current[String(node.data.id)] || node.position)
            .filter(Boolean);

          let aggregatePosition = null;
          if (knownPositions.length > 0) {
            const sum = knownPositions.reduce(
              (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
              { x: 0, y: 0 }
            );

            aggregatePosition = {
              x: sum.x / knownPositions.length,
              y: sum.y / knownPositions.length,
            };
          }

          const isParentScopedBucket = bucketId.startsWith("__agg_parent__");
          filteredNodes.push({
            data: {
              id: bucketId,
              parent: isParentScopedBucket ? bucketId.replace("__agg_parent__", "") : null,
              simpleName: `aggregated (${bucketMembers.length})`,
              label: "Aggregated",
              isAggregated: true,
              isAggregateNode: true,
              weight: bucketMembers.length,
              aggregateMembers: aggregateMembersInfo,
              aggregateContextLabel: "feature scope",
            },
            ...(aggregatePosition ? { position: aggregatePosition } : {}),
            classes: "AggregatedNode",
          });
        });

        const aggregateNodeIds = new Set(
          filteredNodes
            .filter((n) => n?.data?.isAggregateNode)
            .map((n) => String(n.data.id))
        );

        const revealedDepEdges = [];
        Object.values(shownAggregatedMemberDeps).forEach((entry) => {
          const aggregateNodeId = String(entry?.aggregateNodeId || "");
          const memberId = String(entry?.memberId || "");
          if (!aggregateNodeIds.has(aggregateNodeId)) return;

          const memberMeta = aggregatedMemberById.get(memberId);
          if (!memberMeta || memberMeta.bucketId !== aggregateNodeId) return;

          const byNeighbor = entry?.lockedEdgesByNeighbor || {};
          Object.entries(byNeighbor).forEach(([neighborIdRaw, breakdownRaw]) => {
            const neighborId = String(neighborIdRaw);
            if (!keptNodeIdSet.has(neighborId) || !featureScope.has(neighborId)) return;

            const breakdown =
              breakdownRaw && typeof breakdownRaw === "object" ? breakdownRaw : {};
            const weight = Object.values(breakdown).reduce((sum, value) => sum + (Number(value) || 0), 0);
            if (weight <= 0) return;

            revealedDepEdges.push({
              data: {
                id: `agg_feature_dep_${aggregateNodeId}_${memberId}_${neighborId}`,
                source: aggregateNodeId,
                target: neighborId,
                label: "aggregated",
                isAggregated: true,
                weight,
                breakdown,
                memberId,
                isRevealedDependency: true,
              },
              classes: "aggregated",
            });
          });
        });

        if (revealedDepEdges.length > 0) {
          filteredEdges = mergeUniqueElements(filteredEdges, revealedDepEdges).filter((el) => Boolean(el?.data?.source));
        }
      }
    }

    if (edgeFocusNodeIds.size > 0) {
      filteredEdges = filteredEdges.filter((e) => {
        const src = String(e.data.source);
        const tgt = String(e.data.target);
        return edgeFocusNodeIds.has(src) || edgeFocusNodeIds.has(tgt);
      });
    }

    return sanitizeEdgesByPresentNodes([...filteredNodes, ...filteredEdges]);
  }, [graphElements, expandedNodeIds, lockedNodeIds, revealedAggregatedNodeIds, shownAggregatedMemberDeps, edgeFocusNodeIds, activeFeatureIds]);

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

  const handleSummarizeNode = async (nodeId) => {
    try {
      const projectMeta = await projectApi.getProject(projectId);
      setProjectStatus(projectMeta.status);

      if (projectMeta.status === 'summarizing') {
        showToast('Project summarization is already running.', 'info');
        return null;
      }

      const result = await projectApi.summarizeNode(projectId, nodeId);
      const newSummary = result?.summary || null;

      if (newSummary) {
        setGraphElements((prev) => prev.map((el) => {
          if (el?.data?.source) return el;
          if (String(el?.data?.id) !== String(nodeId)) return el;

          return {
            ...el,
            data: {
              ...el.data,
              ai_summary: newSummary,
            }
          };
        }));
      }

      showToast('Node summarization completed.', 'success');
      return newSummary;
    } catch (error) {
      const msg = error.response?.data?.detail || error.message;
      showToast(`Node summarization failed: ${msg}`, 'error');
      throw error;
    }
  };

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
          currentTrace={currentTraceObj}
          traceSteps={traceSteps}
          currentStep={currentStepIndex}
          onStepChange={setCurrentStepIndex}
          failureIndices={failureIndices}
          isDecomposing={projectStatus === 'decomposing'}
          isProjectSummarizing={projectStatus === 'summarizing'}
          onSummarizeNode={handleSummarizeNode}
          onRevealAggregatedMember={handleRevealAggregatedMember}
          onRevealAggregatedMemberDependencies={handleRevealAggregatedMemberDependencies}
        />
      </div>

      <TracePlayer
        traces={availableTraces}
        currentTrace={currentTraceObj}
        traceSteps={traceSteps}
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