import React, { useEffect, useMemo, useRef, useState } from 'react';
import { THEME, EDGE_COLORS, formatKey } from '../../config/graphConfig';

const TRACE_WINDOW_RADIUS = 10;
const SIDEBAR_COLLAPSED_WIDTH = 60;
const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 700;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getAllowedMaxWidth = () => {
    if (typeof window === 'undefined') return SIDEBAR_MAX_WIDTH;
    const viewportMax = Math.floor(window.innerWidth * 0.6);
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, viewportMax));
};

const toFiniteNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const SidebarPanel = ({ 
    isOpen, 
    setIsOpen, 
    edgeVisibility, 
    toggleEdge, 
    features = [], 
    onFeatureToggle,
    activeFeatureIds = new Set(),
    currentTrace = null,
    traceSteps = [],
    microFeatures = [],
    hierarchicalClusters = [],
    activeMicroFeatureId = null,
    onSelectMicroFeature,
    activeTraceFlowHighlight = { mode: null, targetId: null },
    onToggleTraceFlowHighlight,
    currentStep = 0,
    onStepChange,
    failureIndices = [],
    isMicroFeatureFlowLoading = false,
    isDecomposing = false 
}) => {
    const [activeTab, setActiveTab] = useState('structural');
    const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const [expandedClusterIds, setExpandedClusterIds] = useState([]);
    const [selectedClusterId, setSelectedClusterId] = useState(null);
    const sidebarRef = useRef(null);
    const resizingPointerIdRef = useRef(null);
    const failureSet = useMemo(() => new Set(failureIndices), [failureIndices]);

    useEffect(() => {
        setExpandedClusterIds([]);
        setSelectedClusterId(null);
    }, [currentTrace?.id]);

    useEffect(() => {
        setExpandedClusterIds([]);
        setSelectedClusterId(null);
    }, [hierarchicalClusters]);

    useEffect(() => {
        const handleWindowResize = () => {
            setSidebarWidth((prevWidth) => Math.min(prevWidth, getAllowedMaxWidth()));
        };

        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, []);

    useEffect(() => {
        if (!isResizing || !isOpen) return undefined;

        const handlePointerMove = (event) => {
            if (
                resizingPointerIdRef.current !== null &&
                event.pointerId !== resizingPointerIdRef.current
            ) {
                return;
            }

            const left = sidebarRef.current?.getBoundingClientRect?.().left ?? 20;
            const nextWidth = clamp(
                event.clientX - left,
                SIDEBAR_MIN_WIDTH,
                getAllowedMaxWidth()
            );

            setSidebarWidth(nextWidth);
        };

        const stopResizing = (event) => {
            if (
                resizingPointerIdRef.current !== null &&
                event.pointerId !== resizingPointerIdRef.current
            ) {
                return;
            }

            resizingPointerIdRef.current = null;
            setIsResizing(false);
        };

        const previousUserSelect = document.body.style.userSelect;
        const previousCursor = document.body.style.cursor;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopResizing);
        window.addEventListener('pointercancel', stopResizing);

        return () => {
            document.body.style.userSelect = previousUserSelect;
            document.body.style.cursor = previousCursor;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopResizing);
            window.removeEventListener('pointercancel', stopResizing);
        };
    }, [isResizing, isOpen]);

    const handleResizeStart = (event) => {
        if (!isOpen) return;

        resizingPointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setIsResizing(true);
    };

    const nearbySteps = useMemo(() => {
        if (!traceSteps.length) return [];

        const start = Math.max(0, currentStep - TRACE_WINDOW_RADIUS);
        const end = Math.min(traceSteps.length, currentStep + TRACE_WINDOW_RADIUS + 1);

        return traceSteps.slice(start, end).map((step, offset) => ({
            index: start + offset,
            step,
        }));
    }, [traceSteps, currentStep]);

    const getStepLabel = (step, index) => {
        const props = step?.data?.properties || {};
        if (props.simpleName) return props.simpleName;
        if (props.message) return props.message;

        const type = props.type || 'action';
        const source = props.sourceId ? String(props.sourceId) : '?';
        const target = props.targetId ? String(props.targetId) : '?';
        return `${index + 1}: ${type} ${source} -> ${target}`;
    };

    const getActionKind = (step) => {
        const type = String(step?.data?.properties?.type || '').toLowerCase();
        if (type.includes('return')) return 'return';
        if (type.includes('call')) return 'call';
        return null;
    };

    const getResolutionStatus = (step) => {
        const raw = String(step?.data?.properties?.operationResolution || '').toLowerCase();
        if (raw === 'resolved') return { key: 'resolved', label: 'Resolved', color: THEME.success };
        if (raw === 'ambiguous') return { key: 'ambiguous', label: 'Ambiguous', color: '#f59e0b' };
        if (raw === 'unresolved') return { key: 'unresolved', label: 'Unresolved', color: THEME.danger };
        return { key: 'unknown', label: 'Unknown', color: '#6b7280' };
    };

    const getMicroFeatureRange = (microFeature) => {
        const start = Number(microFeature?.start_step);
        const end = Number(microFeature?.end_step);

        if (Number.isFinite(start) && Number.isFinite(end)) {
            return `${start}-${end}`;
        }

        if (Number.isFinite(start)) {
            return `${start}+`;
        }

        return 'n/a';
    };

    const getMicroFeatureLabel = (microFeature, index) => {
        return String(microFeature?.name || `Segment ${index + 1}`);
    };

    const currentTraceStepNumber = useMemo(() => {
        if (!traceSteps.length) return null;

        const safeIndex = Math.min(currentStep, traceSteps.length - 1);
        const currentStepObj = traceSteps[safeIndex];
        const rawStepNumber = Number(currentStepObj?.data?.properties?.step);
        return Number.isFinite(rawStepNumber) ? rawStepNumber : null;
    }, [traceSteps, currentStep]);

    const microFeatureById = useMemo(() => {
        const map = new Map();

        microFeatures.forEach((microFeature) => {
            const id = toFiniteNumberOrNull(microFeature?.id);
            if (id !== null) {
                map.set(id, microFeature);
            }
        });

        return map;
    }, [microFeatures]);

    const sortClustersForFlow = (clusters) => {
        return [...clusters].sort((a, b) => {
            const startA = toFiniteNumberOrNull(a?.start_step);
            const startB = toFiniteNumberOrNull(b?.start_step);

            const normalizedStartA = startA === null ? Number.POSITIVE_INFINITY : startA;
            const normalizedStartB = startB === null ? Number.POSITIVE_INFINITY : startB;

            if (normalizedStartA !== normalizedStartB) {
                return normalizedStartA - normalizedStartB;
            }

            const seqA = toFiniteNumberOrNull(a?.sequence_order);
            const seqB = toFiniteNumberOrNull(b?.sequence_order);
            if (seqA !== null && seqB !== null && seqA !== seqB) {
                return seqA - seqB;
            }

            const idA = toFiniteNumberOrNull(a?.id);
            const idB = toFiniteNumberOrNull(b?.id);
            if (idA === null || idB === null) return 0;
            return idA - idB;
        });
    };

    const orderedHierarchicalClusters = useMemo(() => {
        return sortClustersForFlow(hierarchicalClusters || []);
    }, [hierarchicalClusters]);

    const clusterById = useMemo(() => {
        const map = new Map();

        orderedHierarchicalClusters.forEach((cluster) => {
            const id = toFiniteNumberOrNull(cluster?.id);
            if (id !== null) {
                map.set(id, cluster);
            }
        });

        return map;
    }, [orderedHierarchicalClusters]);

    const childrenByParentId = useMemo(() => {
        const grouped = new Map();

        orderedHierarchicalClusters.forEach((cluster) => {
            const parentId = toFiniteNumberOrNull(cluster?.parent_cluster_id);
            if (parentId === null) return;

            if (!grouped.has(parentId)) {
                grouped.set(parentId, []);
            }

            grouped.get(parentId).push(cluster);
        });

        grouped.forEach((clusters, parentId) => {
            grouped.set(parentId, sortClustersForFlow(clusters));
        });

        return grouped;
    }, [orderedHierarchicalClusters]);

    const getClusterChildren = (cluster) => {
        const leftChildId = toFiniteNumberOrNull(cluster?.left_child_cluster_id);
        const rightChildId = toFiniteNumberOrNull(cluster?.right_child_cluster_id);

        const pointerChildren = [
            leftChildId !== null ? clusterById.get(leftChildId) : null,
            rightChildId !== null ? clusterById.get(rightChildId) : null,
        ].filter(Boolean);

        if (pointerChildren.length > 0) {
            return sortClustersForFlow(pointerChildren);
        }

        const parentId = toFiniteNumberOrNull(cluster?.id);
        if (parentId === null) return [];

        return childrenByParentId.get(parentId) || [];
    };

    const rootClusters = useMemo(() => {
        const roots = orderedHierarchicalClusters.filter((cluster) => {
            const parentId = toFiniteNumberOrNull(cluster?.parent_cluster_id);
            return parentId === null;
        });

        return sortClustersForFlow(roots);
    }, [orderedHierarchicalClusters]);

    const getClusterRange = (cluster) => {
        const clusterStart = toFiniteNumberOrNull(cluster?.start_step);
        const clusterEnd = toFiniteNumberOrNull(cluster?.end_step);

        if (clusterStart !== null || clusterEnd !== null) {
            return {
                start: clusterStart,
                end: clusterEnd,
            };
        }

        const members = (Array.isArray(cluster?.member_micro_feature_ids)
            ? cluster.member_micro_feature_ids
            : []
        )
            .map((memberId) => microFeatureById.get(toFiniteNumberOrNull(memberId)))
            .filter(Boolean);

        const starts = members
            .map((member) => toFiniteNumberOrNull(member?.start_step))
            .filter((value) => value !== null);

        const ends = members
            .map((member) => toFiniteNumberOrNull(member?.end_step))
            .filter((value) => value !== null);

        return {
            start: starts.length ? Math.min(...starts) : null,
            end: ends.length ? Math.max(...ends) : null,
        };
    };

    const activeClusterIds = useMemo(() => {
        if (currentTraceStepNumber == null) return new Set();

        const matches = orderedHierarchicalClusters.filter((cluster) => {
            const { start, end } = getClusterRange(cluster);
            if (start === null) return false;

            if (end !== null) {
                return currentTraceStepNumber >= start && currentTraceStepNumber <= end;
            }

            return currentTraceStepNumber >= start;
        });

        return new Set(
            matches
                .map((cluster) => toFiniteNumberOrNull(cluster?.id))
                .filter((id) => id !== null)
        );
    }, [orderedHierarchicalClusters, currentTraceStepNumber]);

    const getClusterLabel = (cluster, index) => {
        return String(cluster?.name || `Cluster ${index + 1}`);
    };

    const getCompactText = (value, maxLength = 18) => {
        if (typeof value !== 'string') return '';
        return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
    };

    const getClusterStepAnchorMicroFeatureId = (cluster) => {
        const members = (Array.isArray(cluster?.member_micro_feature_ids)
            ? cluster.member_micro_feature_ids
            : []
        )
            .map((memberId) => microFeatureById.get(toFiniteNumberOrNull(memberId)))
            .filter(Boolean)
            .sort((a, b) => {
                const aStart = toFiniteNumberOrNull(a?.start_step) ?? Number.POSITIVE_INFINITY;
                const bStart = toFiniteNumberOrNull(b?.start_step) ?? Number.POSITIVE_INFINITY;
                return aStart - bStart;
            });

        return members[0]?.id ?? null;
    };

    const handleClusterSelect = (event, cluster) => {
        event?.stopPropagation?.();

        const clusterId = toFiniteNumberOrNull(cluster?.id);
        if (clusterId !== null) {
            setSelectedClusterId(clusterId);
        }

        const targetMicroFeatureId = getClusterStepAnchorMicroFeatureId(cluster);
        if (targetMicroFeatureId != null && onSelectMicroFeature) {
            onSelectMicroFeature(targetMicroFeatureId);
        }
    };

    const handleClusterToggleExpand = (event, cluster) => {
        event?.stopPropagation?.();

        const clusterId = toFiniteNumberOrNull(cluster?.id);
        if (clusterId === null) return;

        const children = getClusterChildren(cluster);
        if (!children.length) return;

        setSelectedClusterId(clusterId);
        setExpandedClusterIds((previous) => (
            previous.includes(clusterId)
                ? previous.filter((id) => id !== clusterId)
                : [...previous, clusterId]
        ));

        const targetMicroFeatureId = getClusterStepAnchorMicroFeatureId(cluster);
        if (targetMicroFeatureId != null && onSelectMicroFeature) {
            onSelectMicroFeature(targetMicroFeatureId);
        }
    };

    const handleMicroFeatureSelect = (microFeatureId) => {
        setSelectedClusterId(null);
        if (microFeatureId != null && onSelectMicroFeature) {
            onSelectMicroFeature(microFeatureId);
        }
    };

    const expandedClusterIdSet = useMemo(() => {
        return new Set(
            expandedClusterIds.filter((clusterId) => clusterById.has(clusterId))
        );
    }, [expandedClusterIds, clusterById]);

    useEffect(() => {
        setExpandedClusterIds((previous) => {
            const next = previous.filter((clusterId) => clusterById.has(clusterId));
            if (next.length === previous.length) return previous;
            return next;
        });
    }, [clusterById]);

    const renderDrilldownLane = (clusters, depth = 0) => {
        return clusters.map((cluster, index) => {
            const clusterId = toFiniteNumberOrNull(cluster?.id);
            const children = getClusterChildren(cluster);
            const hasChildren = children.length > 0;
            const isActive = clusterId !== null && activeClusterIds.has(clusterId);
            const isSelected = clusterId !== null && clusterId === toFiniteNumberOrNull(selectedClusterId);
            const isExpanded = clusterId !== null && expandedClusterIdSet.has(clusterId);
            const clusterName = getClusterLabel(cluster, index);
            const compactClusterName = getCompactText(clusterName, 46);

            return (
                <div key={`token_${clusterId ?? `lane_${depth}_${index}`}`} style={hierarchyVerticalNodeWrapperStyle(depth)}>
                    <button
                        type="button"
                        onClick={(event) => handleClusterSelect(event, cluster)}
                        onDoubleClick={(event) => handleClusterToggleExpand(event, cluster)}
                        style={hierarchyVerticalNodeStyle(isActive, isSelected, hasChildren)}
                        title={`${clusterName}${hasChildren ? ' | Double-click to expand/collapse' : ''}`}
                    >
                        <span style={hierarchyVerticalNodeArrowStyle(hasChildren, isExpanded)}>
                            {hasChildren ? (isExpanded ? 'v' : '>') : '-'}
                        </span>
                        <span style={hierarchyVerticalNodeLabelStyle(isActive)}>{compactClusterName}</span>
                        {hasChildren && <span style={circleNodeDrillMarkerStyle} />}
                    </button>

                    {hasChildren && isExpanded && (
                        <div style={hierarchyVerticalChildrenStyle}>
                            {renderDrilldownLane(children, depth + 1)}
                        </div>
                    )}
                </div>
            );
        });
    };

    const selectedClusterForMicroHighlight = useMemo(() => {
        return clusterById.get(toFiniteNumberOrNull(selectedClusterId)) || null;
    }, [clusterById, selectedClusterId]);

    const selectedClusterMicroFeatureIds = useMemo(() => {
        if (!selectedClusterForMicroHighlight) return new Set();

        const memberIds = Array.isArray(selectedClusterForMicroHighlight?.member_micro_feature_ids)
            ? selectedClusterForMicroHighlight.member_micro_feature_ids
            : [];

        return new Set(
            memberIds
                .map((memberId) => toFiniteNumberOrNull(memberId))
                .filter((memberId) => memberId !== null)
        );
    }, [selectedClusterForMicroHighlight]);

    const focusedMicroFeatureForDetails = useMemo(() => {
        if (!microFeatures.length) return null;

        const activeId = toFiniteNumberOrNull(activeMicroFeatureId);
        if (activeId !== null) {
            const activeMatch = microFeatureById.get(activeId);
            if (activeMatch) return activeMatch;
        }

        return microFeatures[0];
    }, [activeMicroFeatureId, microFeatureById, microFeatures]);

    const flowDetailsCard = useMemo(() => {
        if (selectedClusterForMicroHighlight) {
            const selectedClusterChildren = getClusterChildren(selectedClusterForMicroHighlight);
            const isLeafCluster = selectedClusterChildren.length === 0;

            if (isLeafCluster) {
                const anchorMicroFeatureId = toFiniteNumberOrNull(
                    getClusterStepAnchorMicroFeatureId(selectedClusterForMicroHighlight)
                );

                let leafMicroFeature = anchorMicroFeatureId !== null
                    ? microFeatureById.get(anchorMicroFeatureId) || null
                    : null;

                if (!leafMicroFeature) {
                    const firstMemberId = (Array.isArray(selectedClusterForMicroHighlight?.member_micro_feature_ids)
                        ? selectedClusterForMicroHighlight.member_micro_feature_ids
                        : [])
                        .map((memberId) => toFiniteNumberOrNull(memberId))
                        .find((memberId) => memberId !== null);

                    if (firstMemberId !== undefined) {
                        leafMicroFeature = microFeatureById.get(firstMemberId) || null;
                    }
                }

                if (leafMicroFeature) {
                    const selectedIndex = microFeatures.findIndex(
                        (feature) => Number(feature?.id) === Number(leafMicroFeature?.id)
                    );

                    return {
                        kind: 'Micro-Feature',
                        title: getMicroFeatureLabel(
                            leafMicroFeature,
                            selectedIndex >= 0 ? selectedIndex : 0
                        ),
                        rangeLabel: `Steps ${getMicroFeatureRange(leafMicroFeature)}`,
                        countLabel: `${selectedIndex >= 0 ? selectedIndex + 1 : 1}/${Math.max(microFeatures.length, 1)}`,
                        description:
                            leafMicroFeature?.description ||
                            'No summary available for this micro-feature.',
                    };
                }
            }

            const { start, end } = getClusterRange(selectedClusterForMicroHighlight);
            const rangeLabel =
                start !== null && end !== null
                    ? `${start}-${end}`
                    : start !== null
                        ? `${start}+`
                        : 'n/a';

            const memberCount = (Array.isArray(selectedClusterForMicroHighlight?.member_micro_feature_ids)
                ? selectedClusterForMicroHighlight.member_micro_feature_ids
                : []
            )
                .map((memberId) => toFiniteNumberOrNull(memberId))
                .filter((memberId) => memberId !== null).length;

            return {
                kind: 'Cluster',
                title: String(selectedClusterForMicroHighlight?.name || 'Cluster'),
                rangeLabel: `Steps ${rangeLabel}`,
                countLabel: `${memberCount} segments`,
                description:
                    selectedClusterForMicroHighlight?.description ||
                    'No summary available for this cluster.',
            };
        }

        if (!focusedMicroFeatureForDetails) return null;

        const selectedIndex = microFeatures.findIndex(
            (feature) => Number(feature?.id) === Number(focusedMicroFeatureForDetails?.id)
        );

        return {
            kind: 'Micro-Feature',
            title: getMicroFeatureLabel(
                focusedMicroFeatureForDetails,
                selectedIndex >= 0 ? selectedIndex : 0
            ),
            rangeLabel: `Steps ${getMicroFeatureRange(focusedMicroFeatureForDetails)}`,
            countLabel: `${selectedIndex >= 0 ? selectedIndex + 1 : 1}/${Math.max(microFeatures.length, 1)}`,
            description:
                focusedMicroFeatureForDetails?.description ||
                'No summary available for this micro-feature.',
        };
    }, [selectedClusterForMicroHighlight, focusedMicroFeatureForDetails, microFeatures, microFeatureById]);

    const traceFlowHighlightTarget = useMemo(() => {
        if (selectedClusterForMicroHighlight) {
            const clusterId = toFiniteNumberOrNull(selectedClusterForMicroHighlight?.id);
            if (clusterId !== null) {
                const componentIds = new Set();

                selectedClusterMicroFeatureIds.forEach((microId) => {
                    const microFeature = microFeatureById.get(microId);
                    const components = Array.isArray(microFeature?.components)
                        ? microFeature.components
                        : [];

                    components.forEach((componentId) => {
                        if (componentId == null || componentId === '') return;
                        componentIds.add(String(componentId));
                    });
                });

                return {
                    mode: 'cluster',
                    targetId: clusterId,
                    label: 'Cluster',
                    componentCount: componentIds.size,
                };
            }
        }

        const activeMicroId = toFiniteNumberOrNull(activeMicroFeatureId);
        const focusedMicroId = toFiniteNumberOrNull(focusedMicroFeatureForDetails?.id);
        const targetMicroId = activeMicroId ?? focusedMicroId;

        if (targetMicroId === null) return null;

        const componentIds = new Set();
        const targetMicroFeature = microFeatureById.get(targetMicroId);
        const components = Array.isArray(targetMicroFeature?.components)
            ? targetMicroFeature.components
            : [];

        components.forEach((componentId) => {
            if (componentId == null || componentId === '') return;
            componentIds.add(String(componentId));
        });

        return {
            mode: 'micro',
            targetId: targetMicroId,
            label: 'Micro-Feature',
            componentCount: componentIds.size,
        };
    }, [
        selectedClusterForMicroHighlight,
        selectedClusterMicroFeatureIds,
        microFeatureById,
        activeMicroFeatureId,
        focusedMicroFeatureForDetails,
    ]);

    const isTraceFlowHighlightActive = useMemo(() => {
        if (!traceFlowHighlightTarget) return false;

        const activeTargetId = toFiniteNumberOrNull(activeTraceFlowHighlight?.targetId);
        return activeTraceFlowHighlight?.mode === traceFlowHighlightTarget.mode
            && activeTargetId === traceFlowHighlightTarget.targetId;
    }, [activeTraceFlowHighlight, traceFlowHighlightTarget]);

    const canToggleTraceFlowHighlight = Boolean(
        traceFlowHighlightTarget
        && traceFlowHighlightTarget.componentCount > 0
        && onToggleTraceFlowHighlight
    );

    const handleTraceFlowHighlightToggle = () => {
        if (!canToggleTraceFlowHighlight || !traceFlowHighlightTarget) return;

        onToggleTraceFlowHighlight({
            mode: traceFlowHighlightTarget.mode,
            targetId: traceFlowHighlightTarget.targetId,
        });
    };

    const flowHighlightedMicroFeatureIds = useMemo(() => {
        if (selectedClusterForMicroHighlight) {
            return new Set(selectedClusterMicroFeatureIds);
        }

        const activeId = toFiniteNumberOrNull(activeMicroFeatureId);
        if (activeId !== null) {
            return new Set([activeId]);
        }

        const focusedId = toFiniteNumberOrNull(focusedMicroFeatureForDetails?.id);
        return focusedId !== null ? new Set([focusedId]) : new Set();
    }, [
        selectedClusterForMicroHighlight,
        selectedClusterMicroFeatureIds,
        activeMicroFeatureId,
        focusedMicroFeatureForDetails,
    ]);

    const highlightedTraceStepIndexSet = useMemo(() => {
        const highlighted = new Set();
        if (flowHighlightedMicroFeatureIds.size === 0 || traceSteps.length === 0) {
            return highlighted;
        }

        const ranges = [];
        flowHighlightedMicroFeatureIds.forEach((microId) => {
            const microFeature = microFeatureById.get(microId);
            if (!microFeature) return;

            const start = toFiniteNumberOrNull(microFeature?.start_step);
            const end = toFiniteNumberOrNull(microFeature?.end_step);

            if (start === null) return;
            ranges.push({ start, end });
        });

        if (ranges.length === 0) return highlighted;

        traceSteps.forEach((step, index) => {
            const stepNumber = toFiniteNumberOrNull(step?.data?.properties?.step);
            if (stepNumber === null) return;

            const inRange = ranges.some(({ start, end }) => {
                if (end !== null) {
                    return stepNumber >= start && stepNumber <= end;
                }
                return stepNumber >= start;
            });

            if (inRange) highlighted.add(index);
        });

        return highlighted;
    }, [traceSteps, flowHighlightedMicroFeatureIds, microFeatureById]);

    const hierarchyEntryClusters = rootClusters.length > 0 ? rootClusters : orderedHierarchicalClusters;

    return (
        <div ref={sidebarRef} style={sidebarContainerStyle(isOpen, sidebarWidth, isResizing)}>
            {/* PANEL HEADER */}
            <div style={headerStyle(isOpen)}>
                {isOpen && (
                    <div style={{display:'flex', flexDirection:'column'}}>
                        <span style={headerTitleStyle}>FILTERS</span>
                        <span style={headerSubtitleStyle}>Graph Analysis</span>
                    </div>
                )}
                <button onClick={() => setIsOpen(!isOpen)} style={toggleButtonStyle}>
                    {isOpen ? '✕' : '☰'}
                </button>
            </div>

            {!isOpen && (
                <div style={verticalTextContainerStyle}>
                    <span style={verticalTextStyle}>FILTERS</span>
                </div>
            )}

            {isOpen && (
                <div style={contentWrapperStyle}>
                    {/* NAVIGATION TABS */}
                    <div style={tabContainerStyle}>
                        <button 
                            onClick={() => setActiveTab('structural')}
                            style={tabStyle(activeTab === 'structural')}
                        >
                            STRUCTURAL
                        </button>
                        <button 
                            onClick={() => setActiveTab('functional')}
                            style={tabStyle(activeTab === 'functional')}
                        >
                            FUNCTIONAL
                        </button>
                        <button 
                            onClick={() => setActiveTab('trace')}
                            style={tabStyle(activeTab === 'trace')}
                        >
                            TRACE
                        </button>
                    </div>

                    <div style={scrollAreaStyle}>
                        {/* --- SECTION 1: STRUCTURAL FILTERS --- */}
                        {activeTab === 'structural' && (
                            <div style={sectionStyle}>
                                <div style={subHeaderStyle}>RELATIONSHIP TYPES</div>
                                {Object.keys(edgeVisibility).map(type => (
                                    <div 
                                        key={type} 
                                        onClick={() => toggleEdge(type)} 
                                        style={rowStyle(edgeVisibility[type])}
                                    >
                                        <div style={structuralLabelGroupStyle}>
                                            <div style={iconCenterWrapperStyle}>
                                                <span style={dotStyle(EDGE_COLORS[type], edgeVisibility[type])}></span>
                                            </div>
                                            <span style={textStyle(edgeVisibility[type])}>{formatKey(type)}</span>
                                        </div>
                                        
                                        {/* Styled Toggle Switch appearance */}
                                        <div style={visibilityToggleStyle(edgeVisibility[type])}>
                                            {edgeVisibility[type] ? 'ON' : 'OFF'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* --- SECTION 2: FUNCTIONAL FEATURES --- */}
                        {activeTab === 'functional' && (
                            <div style={sectionStyle}>
                                <div style={subHeaderStyle}>RECOVERED FEATURES</div>
                                
                                {isDecomposing && (
                                    <div style={loadingStateStyle}>
                                        <div style={spinnerStyle}></div>
                                        <span>Analyzing runtime patterns...</span>
                                    </div>
                                )}

                                {!isDecomposing && features.length === 0 && (
                                    <div style={emptyStateStyle}>
                                        No features recovered yet.<br/>Run decomposition to identify functional units.
                                    </div>
                                )}

                                {features.map(feature => {
                                    const isActive = activeFeatureIds.has(feature.id);
                                    return (
                                        <div 
                                            key={feature.id} 
                                            onClick={() => onFeatureToggle(feature.id)}
                                            style={featureCardStyle(isActive)}
                                        >
                                            {/* TOP ROW: Icon, Text, and Checkbox */}
                                            <div style={featureCardTopRowStyle}>
                                                <div style={featureLabelGroupStyle}>
                                                    <div style={iconTopWrapperStyle}>
                                                        <span style={featureIconStyle(feature.category)}>
                                                            {feature.category === 'Infrastructure' ? '⚙️' : '🧩'}
                                                        </span>
                                                    </div>
                                                    
                                                    <div style={featureTextGroup}>
                                                        <span style={featureTitleStyle(isActive)}>{feature.name}</span>
                                                        <div style={metaRowStyle}>
                                                            <span style={scoreBadgeStyle}>
                                                                Score: {feature.score.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* CHECKBOX */}
                                                <div style={circleCheckboxStyle(isActive)}>
                                                    {isActive && <span style={checkIconStyle}>✓</span>}
                                                </div>
                                            </div>

                                            {/* BOTTOM ROW: Full-width Description Box */}
                                            {feature.description && (
                                                <div style={descriptionContainerStyle}>
                                                    <span style={{ fontSize: '12px', marginTop: '1px' }}>✨</span>
                                                    <span style={descriptionStyle}>
                                                        {feature.description}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'trace' && (
                            <div style={sectionStyle}>
                                <div style={subHeaderStyle}>TRACE WINDOW</div>

                                {!currentTrace && (
                                    <div style={emptyStateStyle}>
                                        Select a trace in the replay panel to browse steps.
                                    </div>
                                )}

                                {currentTrace && (
                                    <>
                                        <div style={traceSummaryStyle}>
                                            <div style={traceTitleStyle} title={currentTrace.name}>{currentTrace.name}</div>
                                            <div style={traceMetaStyle}>Step {Math.min(currentStep + 1, Math.max(traceSteps.length, 1))} / {traceSteps.length}</div>
                                        </div>

                                        <div style={microFeatureSectionStyle}>
                                            <div style={microFeatureHeaderStyle}>
                                                <span>TRACE FLOWS</span>
                                                <span>{`${orderedHierarchicalClusters.length} clusters | ${microFeatures.length} segments`}</span>
                                            </div>

                                            {isMicroFeatureFlowLoading ? (
                                                <div style={microFeatureEmptyStateStyle}>
                                                    Loading hierarchical and micro-feature flows...
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={flowLaneSectionStyle}>
                                                        <div style={flowLaneHeaderStyle}>
                                                            <span>Hierarchical Flow</span>
                                                            <span>{`${orderedHierarchicalClusters.length} nodes`}</span>
                                                        </div>

                                                        <div style={hierarchicalInlineRailStyle}>
                                                            {orderedHierarchicalClusters.length === 0
                                                                ? <span style={microFeatureEmptyStateStyle}>No hierarchical clusters available for this trace.</span>
                                                                : hierarchyEntryClusters.length > 0
                                                                    ? renderDrilldownLane(hierarchyEntryClusters)
                                                                    : <span style={microFeatureEmptyStateStyle}>No root clusters available for this trace.</span>}
                                                        </div>
                                                    </div>

                                                    <div style={flowLaneSectionStyle}>
                                                        <div style={flowLaneHeaderStyle}>
                                                            <span>Micro-Feature Flow</span>
                                                            <span>{`${microFeatures.length} segments`}</span>
                                                        </div>

                                                        {microFeatures.length === 0 ? (
                                                            <div style={microFeatureEmptyStateStyle}>No micro-features available for this trace.</div>
                                                        ) : (
                                                            <>
                                                                <div style={microFeatureRailStyle}>
                                                                    {microFeatures.map((microFeature, index) => {
                                                                        const microId = Number(microFeature?.id);
                                                                        const isPrimaryActive = Number(activeMicroFeatureId) === microId;
                                                                        const isClusterLinked = selectedClusterMicroFeatureIds.has(microId);
                                                                        const isActive = isPrimaryActive || isClusterLinked;

                                                                        return (
                                                                            <React.Fragment key={microFeature?.id || `micro_feature_${index}`}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleMicroFeatureSelect(microFeature?.id)}
                                                                                    style={microFeatureChipStyle(isActive, isClusterLinked)}
                                                                                    title={`${getMicroFeatureLabel(microFeature, index)} | Steps ${getMicroFeatureRange(microFeature)}`}
                                                                                >
                                                                                    <span style={microFeatureChipIndexStyle}>{index + 1}</span>
                                                                                </button>
                                                                                {index < microFeatures.length - 1 && <span style={microFeatureRailArrowStyle}>→</span>}
                                                                            </React.Fragment>
                                                                        );
                                                                    })}
                                                                </div>

                                                                {flowDetailsCard && (
                                                                    <div style={microFeatureFlowDetailsCardStyle}>
                                                                        <div style={microFeatureFlowMetaStyle}>
                                                                            <span style={microFeatureFlowTypeBadgeStyle}>{flowDetailsCard.kind}</span>
                                                                            <span style={microFeatureFlowRangeBadgeStyle}>{flowDetailsCard.rangeLabel}</span>
                                                                            <span style={microFeatureFlowCountBadgeStyle}>{flowDetailsCard.countLabel}</span>
                                                                        </div>
                                                                        <div style={microFeatureFlowTitleStyle}>
                                                                            {flowDetailsCard.title}
                                                                        </div>
                                                                        <div style={microFeatureFlowDescriptionStyle}>
                                                                            {flowDetailsCard.description}
                                                                        </div>
                                                                        {traceFlowHighlightTarget && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={handleTraceFlowHighlightToggle}
                                                                                disabled={!canToggleTraceFlowHighlight}
                                                                                style={traceFlowHighlightButtonStyle(isTraceFlowHighlightActive, !canToggleTraceFlowHighlight)}
                                                                            >
                                                                                <span>
                                                                                    {isTraceFlowHighlightActive
                                                                                        ? 'Hide highlighted components'
                                                                                        : `Highlight ${traceFlowHighlightTarget.label} Components`}
                                                                                </span>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}

                                                            </>
                                                        )}
                                                    </div>

                                                </>
                                            )}
                                        </div>

                                        <div style={traceListStyle}>
                                            {nearbySteps.map(({ index, step }) => {
                                                const isCurrent = index === currentStep;
                                                const isFailure = failureSet.has(index);
                                                const isFlowHighlighted = highlightedTraceStepIndexSet.has(index);
                                                const actionKind = getActionKind(step);
                                                const resolution = getResolutionStatus(step);

                                                return (
                                                    <button
                                                        key={step?.data?.id || `trace_step_${index}`}
                                                        type="button"
                                                        onClick={() => onStepChange && onStepChange(index)}
                                                        style={traceRowStyle(isCurrent, isFailure, isFlowHighlighted)}
                                                        title={`${getStepLabel(step, index)} | ${actionKind || 'action'} | ${resolution.label}`}
                                                    >
                                                        <span style={traceIndexStyle(isCurrent, isFailure, isFlowHighlighted)}>{index + 1}</span>
                                                        <div style={traceRowContentStyle}>
                                                            <span style={traceLabelStyle}>{getStepLabel(step, index)}</span>
                                                            <div style={traceMetaBadgesStyle}>
                                                                {actionKind && (
                                                                    <span style={traceTypeBadgeStyle(actionKind)}>
                                                                        {actionKind.toUpperCase()}
                                                                    </span>
                                                                )}
                                                                <span style={traceResolutionBadgeStyle}>
                                                                    <span style={traceResolutionDotStyle(resolution.color)}></span>
                                                                    <span>{resolution.label}</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isOpen && (
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                    onPointerDown={handleResizeStart}
                    style={resizeHandleStyle(isResizing)}
                />
            )}
        </div>
    );
};

// --- STATES & CONTAINER ---

const sidebarContainerStyle = (isOpen, width, isResizing) => ({
    width: isOpen ? `${width}px` : `${SIDEBAR_COLLAPSED_WIDTH}px`, 
    position: 'absolute', top: '20px', left: '20px', bottom: '20px',
    // #121212 converted to rgba so the blur effect still works!
    backgroundColor: 'rgba(18, 18, 18, 0.95)', 
    backdropFilter: 'blur(20px)',
    border: `1px solid rgba(255,255,255,0.08)`, 
    borderRadius: '16px',
    transition: isResizing ? 'none' : 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)', 
    zIndex: 100,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
});

const resizeHandleStyle = (isResizing) => ({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '10px',
    cursor: 'col-resize',
    touchAction: 'none',
    zIndex: 120,
    background: isResizing
        ? 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.28) 80%, rgba(255,255,255,0.38) 100%)'
        : 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.08) 80%, rgba(255,255,255,0.16) 100%)',
});

const headerStyle = (isOpen) => ({
    height: '70px', 
    padding: isOpen ? '0 24px' : '0', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: isOpen ? 'space-between' : 'center',
    borderBottom: isOpen ? '1px solid rgba(255,255,255,0.08)' : 'none',
    background: isOpen ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)' : 'transparent',
    transition: 'all 0.3s'
});

const headerTitleStyle = { 
    fontWeight: 800, fontSize: '14px', letterSpacing: '1px', color: THEME.textMain 
};
const headerSubtitleStyle = { 
    fontWeight: 400, fontSize: '11px', color: THEME.textMuted 
};

const toggleButtonStyle = {
    background: 'rgba(255,255,255,0.08)', border: 'none', color: THEME.textMain, 
    cursor: 'pointer', borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', 
    width: '32px', height: '32px', fontSize: '14px',
    transition: 'background 0.2s',
    ':hover': { background: 'rgba(255,255,255,0.15)' }
};

const verticalTextContainerStyle = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '20px'
};

const verticalTextStyle = {
    writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)',
    color: '#666666', // Neutral watermark
    letterSpacing: '6px', fontSize: '13px', fontWeight: '800', opacity: 0.6
};

const contentWrapperStyle = { 
    display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' 
};

// --- NAVIGATION TABS ---

const tabContainerStyle = {
    display: 'flex', padding: '16px 16px 0 16px', gap: '8px', 
    borderBottom: '1px solid rgba(255,255,255,0.05)'
};

const tabStyle = (isActive) => ({
    flex: 1, padding: '10px 0', fontSize: '11px', fontWeight: '700',
    backgroundColor: 'transparent',
    color: isActive ? THEME.primary : '#888888', 
    cursor: 'pointer', letterSpacing: '0.5px', transition: 'all 0.2s',
    border: 'none',
    borderBottom: isActive ? `2px solid ${THEME.primary}` : '2px solid transparent',
});

const scrollAreaStyle = { 
    flex: 1, overflowY: 'auto', padding: '0 0 20px 0' 
};

const sectionStyle = { 
    padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' 
};

const subHeaderStyle = { 
    fontSize: '11px', fontWeight: '800', color: '#777777', 
    marginBottom: '12px', letterSpacing: '1px', textTransform: 'uppercase' 
};

// --- ROW ITEMS ---

const rowStyle = (isActive) => ({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px', borderRadius: '10px', cursor: 'pointer',
    backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
    border: '1px solid',
    borderColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
    transition: 'all 0.2s',
    marginBottom: '4px'
});

const featureCardStyle = (isActive) => ({
    display: 'flex', flexDirection: 'column',
    padding: '12px', borderRadius: '10px', cursor: 'pointer',
    backgroundColor: isActive ? `${THEME.primary}15` : 'rgba(255,255,255,0.03)',
    border: '1px solid',
    borderColor: isActive ? `${THEME.primary}40` : 'transparent',
    transition: 'all 0.2s',
    marginBottom: '6px'
});

const featureCardTopRowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%'
};

const structuralLabelGroupStyle = { 
    display: 'flex', alignItems: 'center', gap: '12px', flex: 1
};

const featureLabelGroupStyle = { 
    display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1
};

const iconCenterWrapperStyle = {
    width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
};

const iconTopWrapperStyle = {
    width: '24px', display: 'flex', justifyContent: 'center', flexShrink: 0, marginTop: '2px' 
};

const textStyle = (isActive) => ({ 
    color: isActive ? THEME.textMain : THEME.textMuted, 
    fontSize: '13px', fontWeight: '500' 
});

const featureTitleStyle = (isActive) => ({
    color: isActive ? '#ffffff' : THEME.textMain,
    fontSize: '13px', fontWeight: '600', marginBottom: '2px', display: 'block'
});

const featureTextGroup = { 
    display: 'flex', flexDirection: 'column', flex: 1 
};

const metaRowStyle = {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'
};

const scoreBadgeStyle = { 
    fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px'
};

const descriptionContainerStyle = {
    display: 'flex', alignItems: 'flex-start', gap: '8px', 
    marginTop: '10px', padding: '10px 12px', 
    backgroundColor: 'rgba(255, 255, 255, 0.04)', 
    borderRadius: '8px',
    borderLeft: `3px solid ${THEME.primary}80`,
    width: '100%', boxSizing: 'border-box' 
};

const descriptionStyle = {
    fontSize: '12px', color: '#cccccc', // Neutral bright silver
    lineHeight: '1.5', fontStyle: 'italic', fontWeight: '400'
};

// --- VISUAL INDICATORS ---

const dotStyle = (color, isVisible) => ({
    width: '8px', height: '8px', borderRadius: '50%',
    backgroundColor: color, 
    boxShadow: isVisible ? `0 0 10px ${color}` : 'none',
    opacity: isVisible ? 1 : 0.3,
    transition: 'all 0.3s'
});

const featureIconStyle = (category) => ({
    fontSize: '16px', opacity: category === 'Infrastructure' ? 0.7 : 1, filter: 'grayscale(0.2)'
});

const circleCheckboxStyle = (isActive) => ({
    width: '20px', height: '20px', borderRadius: '50%',
    border: `2px solid ${isActive ? THEME.primary : THEME.border}`,
    backgroundColor: isActive ? THEME.primary : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', 
    boxShadow: isActive ? `0 0 12px ${THEME.primary}60` : 'none',
    flexShrink: 0, marginTop: '2px'
});

const checkIconStyle = {
    color: '#ffffff', fontSize: '12px', fontWeight: 'bold'
};

const visibilityToggleStyle = (isVisible) => ({
    fontSize: '10px', fontWeight: '700',
    color: isVisible ? '#ffffff' : '#888888',
    background: isVisible ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.3)',
    padding: '2px 8px', borderRadius: '12px',
    minWidth: '30px', textAlign: 'center'
});

// --- STATES ---

const loadingStateStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '16px', padding: '40px 20px', color: THEME.textMuted, fontSize: '13px'
};

const emptyStateStyle = {
    padding: '40px 20px', color: THEME.textMuted, fontSize: '13px',
    textAlign: 'center', lineHeight: '1.6',
    background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
    margin: '10px'
};

const spinnerStyle = {
    width: '24px', height: '24px', borderRadius: '50%',
    border: '3px solid rgba(255,255,255,0.1)',
    borderTop: `3px solid ${THEME.primary}`,
    animation: 'spin 1s linear infinite'
};

const traceSummaryStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    padding: '10px 12px',
    marginBottom: '10px',
};

const traceTitleStyle = {
    fontSize: '12px',
    color: THEME.textMain,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

const traceMetaStyle = {
    marginTop: '4px',
    fontSize: '11px',
    color: THEME.textMuted,
    fontFamily: 'monospace',
};

const microFeatureSectionStyle = {
    marginBottom: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.02)',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
};

const microFeatureHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: THEME.textMuted,
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    fontFamily: 'monospace',
};

const flowLaneSectionStyle = {
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.02)',
    padding: '7px',
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
};

const flowLaneHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#9fb0c9',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.35px',
    textTransform: 'uppercase',
    fontFamily: 'monospace',
};

const microFeatureEmptyStateStyle = {
    fontSize: '11px',
    color: THEME.textMuted,
    padding: '4px 2px',
};

const microFeatureRailStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    overflowX: 'auto',
    padding: '2px 0 4px 0',
};

const microFeatureFlowDetailsCardStyle = {
    marginTop: '6px',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.03)',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
};

const microFeatureFlowMetaStyle = {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
};

const microFeatureFlowTypeBadgeStyle = {
    fontSize: '10px',
    color: '#bfdbfe',
    background: 'rgba(59,130,246,0.20)',
    border: '1px solid rgba(96,165,250,0.35)',
    borderRadius: '10px',
    padding: '1px 7px',
    fontFamily: 'monospace',
};

const microFeatureFlowRangeBadgeStyle = {
    fontSize: '10px',
    color: THEME.textMuted,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '10px',
    padding: '1px 7px',
    fontFamily: 'monospace',
};

const microFeatureFlowCountBadgeStyle = {
    fontSize: '10px',
    color: THEME.textMuted,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '10px',
    padding: '1px 7px',
    fontFamily: 'monospace',
};

const microFeatureFlowTitleStyle = {
    fontSize: '12px',
    fontWeight: 700,
    color: THEME.textMain,
    lineHeight: '1.35',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
};

const microFeatureFlowDescriptionStyle = {
    fontSize: '11px',
    color: '#c9d0da',
    lineHeight: '1.45',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
};

const traceFlowHighlightButtonStyle = (isActive, isDisabled) => ({
    marginTop: '4px',
    borderRadius: '7px',
    border: `1px solid ${isActive ? 'rgba(34,197,94,0.75)' : 'rgba(255,255,255,0.16)'}`,
    background: isActive ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.03)',
    color: isActive ? '#bbf7d0' : THEME.textMain,
    padding: '7px 9px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.15px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.55 : 1,
});

const microFeatureChipStyle = (isActive, isClusterLinked = false) => ({
    width: '24px',
    height: '24px',
    borderRadius: '999px',
    border: '1px solid',
    borderColor: isActive
        ? isClusterLinked
            ? 'rgba(34,197,94,0.85)'
            : `${THEME.primary}80`
        : 'rgba(255,255,255,0.12)',
    background: isActive
        ? isClusterLinked
            ? 'rgba(16,185,129,0.24)'
            : `${THEME.primary}30`
        : 'rgba(255,255,255,0.04)',
    color: isActive
        ? isClusterLinked
            ? '#bbf7d0'
            : THEME.primary
        : THEME.textMuted,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: isActive
        ? isClusterLinked
            ? '0 0 10px rgba(34,197,94,0.40)'
            : `0 0 8px ${THEME.primary}44`
        : 'none',
});

const microFeatureChipIndexStyle = {
    fontFamily: 'monospace',
    fontSize: '10px',
    fontWeight: 700,
};

const microFeatureRailArrowStyle = {
    color: THEME.textMuted,
    fontSize: '11px',
    userSelect: 'none',
    flexShrink: 0,
};

const hierarchicalInlineRailStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '10px',
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '8px',
    borderRadius: '9px',
    border: '1px solid rgba(255,255,255,0.09)',
    background: 'radial-gradient(circle at 20% 0%, rgba(56,189,248,0.10) 0%, rgba(255,255,255,0.02) 55%)',
    maxHeight: '310px',
};

const hierarchyVerticalNodeWrapperStyle = (depth = 0) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginLeft: depth > 0 ? '12px' : '0',
});

const hierarchyVerticalChildrenStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    borderLeft: '1px dashed rgba(148,163,184,0.35)',
    marginLeft: '8px',
    paddingLeft: '8px',
};

const hierarchyVerticalNodeStyle = (isActive, isSelected, hasChildren) => ({
    width: '100%',
    border: '1px solid',
    borderColor: isSelected
        ? 'rgba(96,165,250,0.75)'
        : isActive
        ? `${THEME.success}88`
        : hasChildren
            ? 'rgba(96,165,250,0.42)'
            : 'rgba(148,163,184,0.30)',
    background: isSelected
        ? 'linear-gradient(180deg, rgba(59, 130, 246, 0.30) 0%, rgba(30, 41, 59, 0.40) 100%)'
        : isActive
        ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.28) 0%, rgba(6, 95, 70, 0.30) 100%)'
        : hasChildren
            ? 'linear-gradient(180deg, rgba(30, 58, 138, 0.22) 0%, rgba(30, 41, 59, 0.34) 100%)'
            : 'rgba(51, 65, 85, 0.30)',
    color: THEME.textMain,
    borderRadius: '8px',
    minHeight: '34px',
    padding: '6px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    position: 'relative',
    textAlign: 'left',
});

const hierarchyVerticalNodeArrowStyle = (hasChildren, isExpanded) => ({
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 700,
    color: hasChildren ? (isExpanded ? '#bfdbfe' : '#94a3b8') : '#64748b',
    flexShrink: 0,
});

const hierarchyVerticalNodeLabelStyle = (isActive) => ({
    fontSize: '11px',
    fontWeight: 700,
    color: isActive ? '#ccfbf1' : '#e2e8f0',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: '1.35',
});

const circleNodeDrillMarkerStyle = {
    position: 'absolute',
    right: '4px',
    bottom: '4px',
    width: '5px',
    height: '5px',
    borderRadius: '999px',
    background: '#93c5fd',
    boxShadow: '0 0 5px rgba(147,197,253,0.7)',
};

const traceListStyle = {
    maxHeight: '54vh',
    overflowY: 'auto',
    padding: '4px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
};

const traceRowStyle = (isCurrent, isFailure, isFlowHighlighted = false) => ({
    width: '100%',
    border: `1px solid ${isFlowHighlighted && !isCurrent ? 'rgba(96, 165, 250, 0.35)' : 'transparent'}`,
    borderRadius: '6px',
    background: isCurrent
        ? `${THEME.primary}26`
        : isFailure
            ? 'rgba(239, 68, 68, 0.14)'
            : isFlowHighlighted
                ? 'rgba(59, 130, 246, 0.10)'
                : 'transparent',
    color: THEME.textMain,
    cursor: 'pointer',
    display: 'grid',
    gridTemplateColumns: '38px 1fr',
    gap: '8px',
    alignItems: 'center',
    textAlign: 'left',
    padding: '6px 8px',
    outline: isCurrent ? `1px solid ${THEME.primary}` : 'none',
    boxShadow: isFlowHighlighted && !isCurrent ? 'inset 0 0 0 1px rgba(59,130,246,0.10)' : 'none',
});

const traceIndexStyle = (isCurrent, isFailure, isFlowHighlighted = false) => ({
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: 700,
    color: isCurrent
        ? THEME.primary
        : isFailure
            ? THEME.danger
            : isFlowHighlighted
                ? '#93c5fd'
                : THEME.textMuted,
});

const traceLabelStyle = {
    fontSize: '12px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

const traceRowContentStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
};

const traceMetaBadgesStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
};

const traceTypeBadgeStyle = (kind) => ({
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.4px',
    borderRadius: '10px',
    padding: '1px 7px',
    color: '#fff',
    background: kind === 'return' ? 'rgba(214, 51, 132, 0.85)' : 'rgba(34, 139, 230, 0.85)',
});

const traceResolutionBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '10px',
    color: THEME.textMuted,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '10px',
    padding: '1px 7px',
};

const traceResolutionDotStyle = (color) => ({
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: color,
    boxShadow: `0 0 6px ${color}88`,
});

export default SidebarPanel;