import React, { useState, useEffect, useMemo } from 'react';
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
    onToggleLock, 
    lockedNodeIds, 
    hierarchyMap,
    features,
    activeFeatureIds,
    onFeatureToggle,
    isDecomposing
}) => {
    const [selectedElement, setSelectedElement] = useState(null);
    const [cyInstance, setCyInstance] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    
    const [edgeVisibility, setEdgeVisibility] = useState({
        invokes: true, declares: true, requires: true,
        specializes: true, instantiates: true, uses: true, typed: true, aggregated: true
    });

    const toggleEdge = (type) => {
        setEdgeVisibility(prev => ({...prev, [type]: !prev[type]}));
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

    // --- HELPER: Find the Visible Ancestor ---
    // (This was missing! It finds the folder if the method is hidden)
    const getVisibleNodeId = (targetId) => {
        if (!targetId || !cyInstance) return null;

        // 1. Is the node itself visible?
        if (cyInstance.getElementById(targetId).length > 0) {
            return targetId;
        }

        // 2. If not, check ancestors using the hierarchyMap
        const entry = hierarchyMap?.[targetId];
        const ancestors = entry?.ancestors;
        
        if (ancestors && Array.isArray(ancestors)) {
            // Iterate from closest ancestor up to root
            for (let i = 0; i < ancestors.length; i++) {
                const ancestorId = ancestors[i];
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
            
            cyInstance.elements().removeClass('trace-active trace-path trace-source feature-highlight feature-dim');

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
                    cyInstance.add({
                        group: 'edges',
                        data: {
                            id: GHOST_EDGE_ID,
                            source: visibleSourceId,
                            target: visibleActiveId,
                            label: 'executes'
                        },
                        classes: 'trace-call-edge' // Matches your config style
                    });
                }
            }
        });

    }, [cyInstance, activeNodeId, sourceNodeId, currentAction, activeFeatureIds, elements, hierarchyMap]); 

    // --- LAYOUT & EVENTS (unchanged) ---
    useEffect(() => {
        if (!cyInstance || elements.length === 0) return;
        const runLayout = () => {
             const nodes = cyInstance.nodes();
             const isInitialLoad = nodes.every(n => n.position().x === 0 && n.position().y === 0);
             if (isInitialLoad) {
                cyInstance.layout({ ...layoutOptions, name: 'fcose', fit: true, padding: 50, animate: false, randomize: true }).run();
             } else {
                const unpositioned = nodes.filter(n => n.position().x === 0 && n.position().y === 0);
                if (unpositioned.length > 0) {
                    const positioned = nodes.not(unpositioned);
                    positioned.lock();
                    cyInstance.layout({ ...layoutOptions, fit: false, animate: true, randomize: false }).run();
                    cyInstance.one('layoutstop', () => positioned.unlock());
                }
             }
        };
        const timer = setTimeout(runLayout, 100);
        return () => clearTimeout(timer);
    }, [cyInstance, elements]);

    useEffect(() => {
        if (!cyInstance) return;
        const handleTap = (e) => {
            if (e.target === cyInstance) setSelectedElement(null);
            else setSelectedElement(e.target.data());
        };
        const handleDoubleTap = (e) => {
             if (e.target.isNode() && onToggleExpand) onToggleExpand(e.target.id());
        };
        cyInstance.on('tap', handleTap);
        cyInstance.on('dbltap', 'node', handleDoubleTap);
        return () => {
            cyInstance.removeListener('tap', handleTap);
            cyInstance.removeListener('dbltap', 'node', handleDoubleTap);
        };
    }, [cyInstance, onToggleExpand]);

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
                isDecomposing={isDecomposing}
            />
            <CytoscapeComponent
                elements={elements}
                style={{ width: '100%', height: '100%' }}
                stylesheet={saboStylesheet}
                layout={layoutOptions} 
                cy={setCyInstance}
                minZoom={0.1}
                maxZoom={3}
            />
            <DetailsPanel
                selectedElement={selectedElement}
                onClose={() => setSelectedElement(null)}
                onToggleLock={onToggleLock}
                lockedNodeIds={lockedNodeIds}
                activeTraceAction={currentAction}
                features={features}
            />
        </div>
    );
};

export default SaboGraph;