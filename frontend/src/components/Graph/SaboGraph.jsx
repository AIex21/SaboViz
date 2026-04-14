import React, { useState, useEffect, useMemo, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import DetailsPanel from '../Panel/DetailsPanel';
import SidebarPanel from '../Panel/SidebarPanel';
import { THEME, layoutOptions, saboStylesheet } from '../../config/graphConfig';

cytoscape.use(fcose);

const GHOST_EDGE_ID = 'trace-ghost-edge';

const SaboGraph = ({ 
    data, 
    activeNodeId, 
    sourceNodeId, 
    currentAction, 
    onToggleExpand, 
    onPositionsSnapshot,
    onToggleLock, 
    lockedNodeIds, 
    lockedScopeIds,
    onToggleEdgeFocus,
    edgeFocusNodeIds,
    hierarchyMap,
    features,
    activeFeatureIds,
    onFeatureToggle,
    currentTrace,
    traceSteps,
    microFeatures,
    hierarchicalClusters,
    activeMicroFeatureId,
    onSelectMicroFeature,
    isMicroFeatureFlowLoading,
    currentStep,
    onStepChange,
    failureIndices,
    isDecomposing,
    isProjectSummarizing,
    onSummarizeNode,
    onRevealAggregatedMember,
    onRevealAggregatedMemberDependencies
}) => {
    const [selectedElement, setSelectedElement] = useState(null);
    const [cyInstance, setCyInstance] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const hasInitialLayoutRunRef = useRef(false);
    const knownNodeIdsRef = useRef(new Set());
    
    const [edgeVisibility, setEdgeVisibility] = useState({
        invokes: true,
        requires: true,
        specializes: true, 
        instantiates: true,
        aggregated: true
    });

    const toggleEdge = (type) => {
        setEdgeVisibility(prev => ({...prev, [type]: !prev[type]}));
    };

    const exportNodePositions = () => {
        if (!cyInstance) return {};

        const positions = {};
        cyInstance.nodes().forEach(node => {
            positions[node.id()] = { ...node.position() };
        });

        return positions;
    };

    const resolveOverlaps = (nodesCollection, fixedNodeIds = new Set()) => {
        if (!nodesCollection || nodesCollection.length < 2) return;

        const visibleNodes = nodesCollection.filter((n) => n.visible());
        if (visibleNodes.length < 2) return;

        const groupsByParent = new Map();
        visibleNodes.forEach((node) => {
            // Group by parent so overlap resolution happens among siblings (same level).
            const parentId = node.data('parent');
            const levelKey = parentId != null ? String(parentId) : '__root__';

            if (!groupsByParent.has(levelKey)) groupsByParent.set(levelKey, []);
            groupsByParent.get(levelKey).push(node);
        });

        const maxIterations = 8;
        const padding = 12;
        const maxPush = 24;
        const maxGroupSize = 180;

        const getCollisionRect = (node) => {
            const bb = node.boundingBox({ includeLabels: true, includeOverlays: false });
            return {
                cx: (bb.x1 + bb.x2) / 2,
                cy: (bb.y1 + bb.y2) / 2,
                w: Math.max(1, bb.x2 - bb.x1),
                h: Math.max(1, bb.y2 - bb.y1),
            };
        };

        cyInstance.batch(() => {
            groupsByParent.forEach((group) => {
                // Include leaves and expanded containers as collision bodies.
                const colliders = group.filter((n) => n.children().length === 0 || n.data('expanded') === true);
                if (colliders.length < 2 || colliders.length > maxGroupSize) return;

                for (let iter = 0; iter < maxIterations; iter++) {
                    let movedAny = false;

                    for (let i = 0; i < colliders.length; i++) {
                        const a = colliders[i];
                        const aRect = getCollisionRect(a);

                        for (let j = i + 1; j < colliders.length; j++) {
                            const b = colliders[j];
                            const bRect = getCollisionRect(b);

                            const minDx = (aRect.w + bRect.w) / 2 + padding;
                            const minDy = (aRect.h + bRect.h) / 2 + padding;
                            const dx = bRect.cx - aRect.cx;
                            const dy = bRect.cy - aRect.cy;

                            if (Math.abs(dx) >= minDx || Math.abs(dy) >= minDy) continue;

                            const overlapX = minDx - Math.abs(dx);
                            const overlapY = minDy - Math.abs(dy);

                            let pushX = 0;
                            let pushY = 0;

                            if (overlapX < overlapY) {
                                const sign = dx === 0 ? ((a.id() < b.id()) ? -1 : 1) : Math.sign(dx);
                                pushX = (overlapX / 2) * sign;
                            } else {
                                const sign = dy === 0 ? ((a.id() < b.id()) ? -1 : 1) : Math.sign(dy);
                                pushY = (overlapY / 2) * sign;
                            }

                            // Clamp displacement to prevent oscillation/explosions.
                            pushX = Math.max(-maxPush, Math.min(maxPush, pushX));
                            pushY = Math.max(-maxPush, Math.min(maxPush, pushY));

                            const aFixed = fixedNodeIds.has(a.id());
                            const bFixed = fixedNodeIds.has(b.id());
                            const aPos = a.position();
                            const bPos = b.position();

                            if (!aFixed && !bFixed) {
                                a.position({ x: aPos.x - pushX, y: aPos.y - pushY });
                                b.position({ x: bPos.x + pushX, y: bPos.y + pushY });
                            } else if (!aFixed && bFixed) {
                                a.position({ x: aPos.x - 2 * pushX, y: aPos.y - 2 * pushY });
                            } else if (aFixed && !bFixed) {
                                b.position({ x: bPos.x + 2 * pushX, y: bPos.y + 2 * pushY });
                            }

                            movedAny = true;
                        }
                    }

                    if (!movedAny) break;
                }
            });
        });
    };

    const elements = useMemo(() => {
        if (!data || !data.elements) return [];
        const allElements = Array.isArray(data.elements) ? data.elements : [...(data.elements.nodes||[]), ...(data.elements.edges||[])];
        
        return allElements.filter(ele => {
            if (ele.data.source && ele.data.target) {
                const type = ele.data.label;
                return edgeVisibility[type] !== false;
            }
            return true;
        });
    }, [data, edgeVisibility]);

    const hasPresetNodePositions = useMemo(() => {
        return elements.some((ele) => {
            if (ele?.data?.source) return false;
            const x = Number(ele?.position?.x);
            const y = Number(ele?.position?.y);
            return Number.isFinite(x) && Number.isFinite(y);
        });
    }, [elements]);

    const aggregateMemberToNodeId = useMemo(() => {
        const mapping = new Map();

        elements.forEach((ele) => {
            if (ele?.data?.source) return;
            if (!ele?.data?.isAggregateNode) return;

            const aggregateNodeId = String(ele.data.id);
            const members = Array.isArray(ele?.data?.aggregateMembers)
                ? ele.data.aggregateMembers
                : [];

            members.forEach((member) => {
                const memberId = member?.id;
                if (memberId == null) return;
                mapping.set(String(memberId), aggregateNodeId);
            });
        });

        return mapping;
    }, [elements]);

    // --- HELPER: Find the Visible Ancestor ---
    const getVisibleNodeId = (targetId) => {
        if (!targetId || !cyInstance) return null;
        const targetIdStr = String(targetId);

        // 1. Is the node itself visible?
        if (cyInstance.getElementById(targetIdStr).length > 0) {
            return targetIdStr;
        }

        // 2. If this node is currently represented by an aggregate node, prefer that.
        const aggregateNodeId = aggregateMemberToNodeId.get(targetIdStr);
        if (aggregateNodeId && cyInstance.getElementById(aggregateNodeId).length > 0) {
            return aggregateNodeId;
        }

        // 3. If not, check ancestors using the hierarchyMap.
        const entry = hierarchyMap?.[targetIdStr];
        const ancestors = entry?.ancestors;
        
        if (ancestors && Array.isArray(ancestors)) {
            // Iterate from closest ancestor up to root
            for (let i = 0; i < ancestors.length; i++) {
                const ancestorId = String(ancestors[i]);

                const ancestorAggregateNodeId = aggregateMemberToNodeId.get(ancestorId);
                if (ancestorAggregateNodeId && cyInstance.getElementById(ancestorAggregateNodeId).length > 0) {
                    return ancestorAggregateNodeId;
                }

                if (cyInstance.getElementById(ancestorId).length > 0) {
                    return ancestorId;
                }
            }
        }
        return null;
    };

    // --- MAIN HIGHLIGHTING EFFECT ---
    useEffect(() => {
        if (!cyInstance) return;

        cyInstance.batch(() => {
            // 1. Clear previous Trace styles
            const oldGhost = cyInstance.getElementById(GHOST_EDGE_ID);
            if (oldGhost.length > 0) cyInstance.remove(oldGhost);
            
            cyInstance.elements().removeClass('trace-active trace-path trace-source feature-highlight feature-dim lock-root lock-scope edge-focus-root edge-focus-edge');

            // 2. FEATURE HIGHLIGHTING
            if (activeFeatureIds && activeFeatureIds.size > 0) {
                const nodes = cyInstance.nodes();
                cyInstance.elements().addClass('feature-dim');

                nodes.forEach(node => {
                    const nodeFeatures = node.data('participating_features') || [];
                    const isExpanded = node.data('expanded') === true;
                    const hasActiveFeature = nodeFeatures.some(fid => activeFeatureIds.has(fid));

                    if (hasActiveFeature && !isExpanded) {
                        node.removeClass('feature-dim').addClass('feature-highlight');
                    } else if (hasActiveFeature && isExpanded) {
                        node.removeClass('feature-dim');
                    }
                });

                // Highlight connecting edges
                cyInstance.edges().forEach(edge => {
                    const src = edge.source();
                    const tgt = edge.target();
                    if (!src.hasClass('feature-dim') && !tgt.hasClass('feature-dim')) {
                        edge.removeClass('feature-dim').addClass('feature-highlight');
                    }
                });
            }

            // 2.5 LOCK FOCUS STYLING
            if (lockedScopeIds && lockedScopeIds.size > 0) {
                cyInstance.nodes().forEach(node => {
                    const nodeId = String(node.id());
                    if (lockedNodeIds && lockedNodeIds.has(nodeId)) {
                        node.addClass('lock-root');
                    } else if (lockedScopeIds.has(nodeId)) {
                        node.addClass('lock-scope');
                    }
                });
            }

            // 2.6 EDGE FOCUS STYLING
            if (edgeFocusNodeIds && edgeFocusNodeIds.size > 0) {
                cyInstance.nodes().forEach((node) => {
                    const nodeId = String(node.id());
                    if (edgeFocusNodeIds.has(nodeId)) {
                        node.addClass('edge-focus-root');
                    }
                });

                cyInstance.edges().forEach((edge) => {
                    const src = String(edge.data('source'));
                    const tgt = String(edge.data('target'));
                    if (edgeFocusNodeIds.has(src) || edgeFocusNodeIds.has(tgt)) {
                        edge.addClass('edge-focus-edge');
                    }
                });
            }

            // 3. TRACE HIGHLIGHTING (Fixed)
            if (activeNodeId && sourceNodeId) {
                // Use the helper to resolve IDs to what is actually on screen
                const visibleActiveId = getVisibleNodeId(activeNodeId);
                const visibleSourceId = getVisibleNodeId(sourceNodeId);

                if (visibleActiveId) {
                    const node = cyInstance.getElementById(visibleActiveId);
                    node.removeClass('feature-dim').addClass('trace-active');
                    node.ancestors().addClass('trace-path');
                }
                
                if (visibleSourceId) {
                    const node = cyInstance.getElementById(visibleSourceId);
                    node.removeClass('feature-dim').addClass('trace-source');
                }

                // Only draw the edge if both ends are resolved to visible nodes
                if (visibleActiveId && visibleSourceId && currentAction) {
                    const isSelfLoop = visibleSourceId === visibleActiveId;
                    cyInstance.add({
                        group: 'edges',
                        data: {
                            id: GHOST_EDGE_ID,
                            source: visibleSourceId,
                            target: visibleActiveId,
                            label: 'executes'
                        },
                        classes: isSelfLoop ? 'trace-call-edge trace-call-loop' : 'trace-call-edge'
                    });
                }
            }
        });

    }, [cyInstance, activeNodeId, sourceNodeId, currentAction, activeFeatureIds, elements, hierarchyMap, lockedScopeIds, lockedNodeIds, edgeFocusNodeIds]); 

    // --- LAYOUT & EVENTS ---
    useEffect(() => {
        if (!cyInstance || elements.length === 0) return;

        const runLayout = () => {
             const nodes = cyInstance.nodes();
             if (nodes.length === 0) return;

             const previousNodeIds = knownNodeIdsRef.current;
             const currentNodeIds = new Set(nodes.map(n => n.id()));
             const retainedCount = nodes.filter(n => previousNodeIds.has(n.id())).length;
             const newNodes = nodes.filter(n => !previousNodeIds.has(n.id()));

             if (!hasInitialLayoutRunRef.current || retainedCount === 0) {
                if (hasPresetNodePositions) {
                    const allNodes = cyInstance.nodes();
                    if (allNodes.length > 0) {
                        cyInstance.fit(allNodes, 50);
                    }

                    knownNodeIdsRef.current = currentNodeIds;
                    hasInitialLayoutRunRef.current = true;
                    if (onPositionsSnapshot) onPositionsSnapshot(exportNodePositions());
                    return;
                }

                const initialLayout = cyInstance.layout({ 
                    ...layoutOptions, 
                    name: 'fcose', 
                    fit: true, 
                    padding: 50, 
                    animate: false, 
                    randomize: true 
                });

                initialLayout.on('layoutstop', () => {
                    resolveOverlaps(cyInstance.nodes());
                    knownNodeIdsRef.current = new Set(cyInstance.nodes().map(n => n.id()));
                    if (onPositionsSnapshot) onPositionsSnapshot(exportNodePositions());
                });

                initialLayout.run();
                hasInitialLayoutRunRef.current = true;
                return;
             }

             if (newNodes.length > 0) {
                const byParent = new Map();
                newNodes.forEach((node) => {
                    const parentId = node.data('parent');
                    if (!parentId) return;
                    if (!byParent.has(parentId)) byParent.set(parentId, []);
                    byParent.get(parentId).push(node);
                });

                byParent.forEach((children, parentId) => {
                    const parentNode = cyInstance.getElementById(parentId);
                    if (parentNode.length === 0) return;

                    const anchor = parentNode.position();
                    // Seed in a spiral around parent so fCoSE starts from a non-degenerate state.
                    children.forEach((child, idx) => {
                        const seedAngle = idx * 2.399963229728653; // golden angle
                        const seedRadius = 28 + Math.sqrt(idx + 1) * 22;
                        child.position({
                            x: anchor.x + Math.cos(seedAngle) * seedRadius,
                            y: anchor.y + Math.sin(seedAngle) * seedRadius,
                        });
                    });

                    const childrenCollection = cyInstance.collection(children);

                    // Immediately resolve local collisions after seeding child positions.
                    const seedCollisionRadius = 220;
                    const seedNearbyNodes = cyInstance.nodes().filter((n) => {
                        const p = n.position();
                        return Math.hypot(p.x - anchor.x, p.y - anchor.y) <= seedCollisionRadius;
                    });
                    resolveOverlaps(childrenCollection.union(seedNearbyNodes), new Set([parentId]));

                    const regionNodes = childrenCollection.union(parentNode);
                    const regionIds = new Set(regionNodes.map((n) => n.id()));
                    const regionEdges = cyInstance.edges().filter((edge) => {
                        const src = edge.source().id();
                        const tgt = edge.target().id();
                        return regionIds.has(src) && regionIds.has(tgt) && !edge.data('isAggregated');
                    });

                    // Structural parent-child edges are hidden in data, so add temporary guide edges
                    // to give fCoSE distance constraints. Also add a lightweight chain to avoid center clumping.
                    const starGuideEdges = children.map((child, idx) => ({
                        group: 'edges',
                        data: {
                            id: `__layout_guide__${parentId}__${child.id()}__${idx}__${Date.now()}`,
                            source: parentId,
                            target: child.id(),
                            isLayoutGuide: true,
                        },
                    }));

                    const chainGuideEdges = children.slice(1).map((child, idx) => ({
                        group: 'edges',
                        data: {
                            id: `__layout_chain__${parentId}__${children[idx].id()}__${child.id()}__${Date.now()}`,
                            source: children[idx].id(),
                            target: child.id(),
                            isLayoutGuide: true,
                        },
                    }));

                    const guideEdges = [...starGuideEdges, ...chainGuideEdges];

                    const addedGuideEdges = cyInstance.add(guideEdges);
                    addedGuideEdges.style({
                        opacity: 0,
                        width: 0.001,
                        'target-arrow-shape': 'none',
                        events: 'no',
                    });

                    const localLayout = regionNodes.union(regionEdges).union(addedGuideEdges).layout({
                        ...layoutOptions,
                        name: 'fcose',
                        fit: false,
                        animate: true,
                        animationDuration: 320,
                        randomize: false,
                        quality: 'draft',
                        numIter: 1200,
                        idealEdgeLength: 200,
                        nodeRepulsion: 26000,
                        gravity: 0.04,
                        nestingFactor: 0.03,
                        fixedNodeConstraint: [{ nodeId: parentId, position: { ...anchor } }],
                    });

                    localLayout.on('layoutstop', () => {
                        cyInstance.remove(addedGuideEdges);
                        const bb = regionNodes.boundingBox();
                        const margin = 140;
                        const nearbyNodes = cyInstance.nodes().filter((n) => {
                            const p = n.position();
                            return (
                                p.x >= bb.x1 - margin &&
                                p.x <= bb.x2 + margin &&
                                p.y >= bb.y1 - margin &&
                                p.y <= bb.y2 + margin
                            );
                        });

                        resolveOverlaps(regionNodes.union(nearbyNodes), new Set([parentId]));
                        if (onPositionsSnapshot) onPositionsSnapshot(exportNodePositions());
                    });

                    localLayout.run();
                });
             }

             knownNodeIdsRef.current = currentNodeIds;
             if (onPositionsSnapshot) onPositionsSnapshot(exportNodePositions());
        };

        const timer = setTimeout(runLayout, 100);
        return () => clearTimeout(timer);
    }, [cyInstance, elements, onPositionsSnapshot, hasPresetNodePositions]);

    useEffect(() => {
        if (!cyInstance) return;
        const handleTap = (e) => {
            if (e.target === cyInstance) setSelectedElement(null);
            else setSelectedElement(e.target.data());
        };
        const handleDoubleTap = (e) => {
             if (e.target.isNode() && onToggleExpand) {
                if (onPositionsSnapshot) onPositionsSnapshot(exportNodePositions());
                onToggleExpand(e.target.id());
             }
        };
        const handleDragFree = (e) => {
            if (e.target && e.target.isNode && e.target.isNode()) {
                const movedNode = e.target;
                const movedPos = movedNode.position();
                const nearby = cyInstance.nodes().filter((n) => {
                    if (n.id() === movedNode.id()) return true;
                    const p = n.position();
                    return Math.hypot(p.x - movedPos.x, p.y - movedPos.y) <= 280;
                });
                resolveOverlaps(nearby, new Set([movedNode.id()]));

                // If a moved node belongs to a compound, its ancestors may resize and create
                // new collisions even when those colliders are not near the moved child itself.
                const ancestors = movedNode.ancestors().filter((n) => n.isNode());
                if (ancestors.length > 0) {
                    let growthScope = cyInstance.collection();
                    const growthFixedIds = new Set([movedNode.id()]);
                    const growthMargin = 180;

                    ancestors.forEach((ancestor) => {
                        growthFixedIds.add(ancestor.id());
                        const bb = ancestor.boundingBox();

                        const nearbyToAncestor = cyInstance.nodes().filter((n) => {
                            const p = n.position();
                            return (
                                p.x >= bb.x1 - growthMargin &&
                                p.x <= bb.x2 + growthMargin &&
                                p.y >= bb.y1 - growthMargin &&
                                p.y <= bb.y2 + growthMargin
                            );
                        });

                        growthScope = growthScope.union(nearbyToAncestor).union(ancestor);
                    });

                    resolveOverlaps(growthScope, growthFixedIds);
                }
            }
            if (onPositionsSnapshot) onPositionsSnapshot(exportNodePositions());
        };
        cyInstance.on('tap', handleTap);
        cyInstance.on('dbltap', 'node', handleDoubleTap);
        cyInstance.on('dragfree', 'node', handleDragFree);
        return () => {
            cyInstance.removeListener('tap', handleTap);
            cyInstance.removeListener('dbltap', 'node', handleDoubleTap);
            cyInstance.removeListener('dragfree', 'node', handleDragFree);
        };
    }, [cyInstance, onToggleExpand, onPositionsSnapshot]);

    useEffect(() => {
        if (!cyInstance || !selectedElement?.id) return;

        const selectedId = String(selectedElement.id);
        const currentElement = cyInstance.getElementById(selectedId);

        if (currentElement.length > 0) {
            setSelectedElement({ ...currentElement.data() });
            return;
        }

        // If the selected item disappeared after a graph update, close the panel.
        setSelectedElement(null);
    }, [cyInstance, elements, selectedElement?.id]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: THEME.bg }}>
            <SidebarPanel 
                isOpen={isSidebarOpen}
                setIsOpen={setIsSidebarOpen}
                edgeVisibility={edgeVisibility}
                toggleEdge={toggleEdge}
                features={features}
                activeFeatureIds={activeFeatureIds}
                onFeatureToggle={onFeatureToggle}
                currentTrace={currentTrace}
                traceSteps={traceSteps}
                microFeatures={microFeatures}
                hierarchicalClusters={hierarchicalClusters}
                activeMicroFeatureId={activeMicroFeatureId}
                onSelectMicroFeature={onSelectMicroFeature}
                isMicroFeatureFlowLoading={isMicroFeatureFlowLoading}
                currentStep={currentStep}
                onStepChange={onStepChange}
                failureIndices={failureIndices}
                isDecomposing={isDecomposing}
            />
            <CytoscapeComponent
                elements={elements}
                style={{ width: '100%', height: '100%' }}
                stylesheet={saboStylesheet}
                layout={{ name: 'preset' }} 
                cy={setCyInstance}
                minZoom={0.1}
                maxZoom={3}
            />
            <DetailsPanel
                selectedElement={selectedElement}
                onClose={() => setSelectedElement(null)}
                onToggleLock={onToggleLock}
                lockedNodeIds={lockedNodeIds}
                onToggleEdgeFocus={onToggleEdgeFocus}
                edgeFocusNodeIds={edgeFocusNodeIds}
                activeTraceAction={currentAction}
                features={features}
                isProjectSummarizing={isProjectSummarizing}
                onRevealAggregatedMember={onRevealAggregatedMember}
                onRevealAggregatedMemberDependencies={onRevealAggregatedMemberDependencies}
                onSummarizeNode={async (nodeId) => {
                    if (!onSummarizeNode) return null;
                    const summary = await onSummarizeNode(nodeId);

                    if (summary) {
                        setSelectedElement((prev) => {
                            if (!prev || String(prev.id) !== String(nodeId)) return prev;
                            return { ...prev, ai_summary: summary };
                        });

                        if (cyInstance) {
                            const node = cyInstance.getElementById(String(nodeId));
                            if (node.length > 0) {
                                node.data('ai_summary', summary);
                            }
                        }
                    }

                    return summary;
                }}
            />
        </div>
    );
};

export default SaboGraph;