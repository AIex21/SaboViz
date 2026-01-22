import React, { useState, useEffect, useMemo } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import DetailsPanel from '../Panel/DetailsPanel';
import { THEME, EDGE_COLORS, layoutOptions, saboStylesheet, formatKey } from '../../config/graphConfig';

cytoscape.use(fcose);

const GHOST_EDGE_ID = 'trace-ghost-edge';

const SaboGraph = ({ data, activeNodeId, sourceNodeId, currentAction, onToggleExpand, onToggleLock, lockedNodeIds, hierarchyMap }) => {
    const [selectedElement, setSelectedElement] = useState(null);
    const [cyInstance, setCyInstance] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [edgeVisibility, setEdgeVisibility] = useState({
        invokes: true, declares: true, requires: true,
        specializes: true, instantiates: true, uses: true, typed: true, aggregated: true
    });

    // --- 1. PREPARE ELEMENTS ---
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

    // --- 2. HANDLING CLICKS (THE FIX) ---
    useEffect(() => {
        if (!cyInstance) return;

        const handleTap = (event) => {
            const target = event.target;
            if (target === cyInstance) {
                // Clicked on background -> Close Panel
                setSelectedElement(null);
            } else {
                // Clicked on Node/Edge -> Open Panel
                setSelectedElement(target.data());
            }
        };

        const handleDoubleTap = (event) => {
             // Only logic for nodes
             if (event.target !== cyInstance && event.target.isNode()) {
                 if (onToggleExpand) onToggleExpand(event.target.id());
             }
        };

        cyInstance.on('tap', handleTap);
        cyInstance.on('dbltap', 'node', handleDoubleTap);

        // Cleanup listeners on unmount or re-render
        return () => {
            cyInstance.removeListener('tap', handleTap);
            cyInstance.removeListener('dbltap', 'node', handleDoubleTap);
        };
    }, [cyInstance, onToggleExpand]);

    // --- 3. LAYOUT LOGIC ---
    useEffect(() => {
        if (!cyInstance) return;
        const runLayout = () => {
             const nodes = cyInstance.nodes();
             
             const unpositioned = nodes.filter(n => n.position().x ===0 && n.position().y ===0);
             const isInitialLoad = unpositioned.length > nodes.length * 0.8;

             if (isInitialLoad){
                cyInstance.layout({
                    ...layoutOptions,
                    randomize: true,
                    fit: true
                }).run();
             } else if (unpositioned.length > 0) {
                cyInstance.layout({
                    ...layoutOptions,
                    randomize: false,
                    fit: false,
                    animate: true,
                    quality: 'default'
                }).run();
             }
        };
        const timer = setTimeout(runLayout, 50);
        return () => clearTimeout(timer);
    }, [cyInstance, elements.length]);

    // --- 4. TRACE HIGHLIGHTING ---
    const getVisibleNodeId = (targetId) => {
        if (!targetId || !cyInstance) return null;

        if (cyInstance.getElementById(targetId).length > 0) return targetId;

        const entry = hierarchyMap?.[targetId];
        const ancestors = entry?.ancestors;
        
        if (ancestors && Array.isArray(ancestors)) {
            for (const ancestorId of ancestors) {
                if (cyInstance.getElementById(ancestorId).length > 0) {
                    return ancestorId;
                }
            }
        }
        return null;
    };

    useEffect(() => {
        if (!cyInstance) return;

        const oldGhost = cyInstance.getElementById(GHOST_EDGE_ID);
        if (oldGhost.length > 0) cyInstance.remove(oldGhost);
        cyInstance.elements().removeClass('trace-active trace-path trace-source');

        if (!activeNodeId || !sourceNodeId) return;

        const visibleActiveId = getVisibleNodeId(activeNodeId);
        const visibleSourceId = getVisibleNodeId(sourceNodeId);

        if (visibleActiveId) {
            cyInstance.getElementById(visibleActiveId)
                .addClass('trace-active')
                .ancestors().addClass('trace-path');
        }
        if (visibleSourceId) {
            cyInstance.getElementById(visibleSourceId).addClass('trace-source');
        }

        if (visibleActiveId && visibleSourceId && currentAction) {
            cyInstance.add({
                group: 'edges',
                data: {
                    id: GHOST_EDGE_ID,
                    source: visibleSourceId,
                    target: visibleActiveId,
                    label: 'executes'
                },
                classes: 'trace-call-edge'
            });
        }

    }, [cyInstance, activeNodeId, sourceNodeId, currentAction, hierarchyMap]);

    const toggleEdge = (type) => {
        setEdgeVisibility(prev => ({...prev, [type]: !prev[type]}));
    };

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: THEME.bg }}>
            
            {/* SIDEBAR */}
            <div style={sidebarStyle(isSidebarOpen)}>
                <div style={sidebarHeaderStyle}>
                     {isSidebarOpen && <span style={filterTitleStyle}>FILTERS</span>}
                     <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={sidebarToggleStyle}>
                        {isSidebarOpen ? '←' : '→'}
                    </button>
                </div>
                <div style={sidebarContentStyle(isSidebarOpen)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {Object.keys(edgeVisibility).map(type => (
                            <div key={type} onClick={() => toggleEdge(type)} style={{...filterRowStyle, opacity: edgeVisibility[type] ? 1 : 0.5}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                    <span style={{width: '8px', height: '8px', borderRadius: '50%', backgroundColor: EDGE_COLORS[type] || '#999', boxShadow: edgeVisibility[type] ? `0 0 8px ${EDGE_COLORS[type]}` : 'none'}}></span>
                                    <span style={{color: '#eee', fontSize: '12px', fontWeight: 500}}>{formatKey(type)}</span>
                                </div>
                                <span style={{fontSize:'10px', color: '#666', fontFamily: 'monospace'}}>{edgeVisibility[type] ? 'ON' : 'OFF'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            {/* GRAPH */}
            <CytoscapeComponent
                elements={elements}
                style={{ width: '100%', height: '100%' }}
                stylesheet={saboStylesheet}
                layout={layoutOptions} 
                cy={setCyInstance}
            />

            {/* DETAILS PANEL */}
            <DetailsPanel
                selectedElement={selectedElement}
                onClose={() => setSelectedElement(null)}
                onToggleLock={onToggleLock}
                lockedNodeIds={lockedNodeIds}
                activeTraceAction={currentAction}
            />
        </div>
    );
};

// --- STYLES ---
const sidebarStyle = (isOpen) => ({
    width: isOpen ? '220px' : '44px',
    position: 'absolute', top: 20, left: 20, 
    backgroundColor: 'rgba(30, 30, 30, 0.85)', backdropFilter: 'blur(12px)',
    border: `1px solid ${THEME.border}`, borderRadius: '12px',
    transition: 'width 0.3s cubic-bezier(0.25, 1, 0.5, 1)', zIndex: 100,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden'
});

const sidebarHeaderStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)',
    height: '50px', boxSizing: 'border-box'
};
const filterTitleStyle = { fontWeight: 700, fontSize: '12px', letterSpacing:'1px', color: '#888' };
const sidebarToggleStyle = {
    background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px'
};
const sidebarContentStyle = (isOpen) => ({
    opacity: isOpen ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: isOpen ? 'auto' : 'none',
    padding: '10px', visibility: isOpen ? 'visible' : 'hidden'
});
const filterRowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s'
};

export default SaboGraph;