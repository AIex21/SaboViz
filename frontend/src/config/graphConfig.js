// ============================================================================
// 1. THEME & COLORS
// ============================================================================

export const THEME = {
    bg: '#121212',           // App Background
    panelBg: '#1e1e1e',      // Card/Panel Background
    border: '#333333',       // Borders
    textMain: '#e0e0e0',     // Primary Text
    textMuted: '#a0a0a0',    // Secondary Text
    primary: '#3b82f6',      // Primary Action (Blue)
    primaryHover: '#2563eb', 
    danger: '#ef4444',       // Delete/Error (Red)
    success: '#10b981',      // Success (Green)
    warning: '#f59e0b',      // Warning (Orange)
    unresolved: '#eab308',
    summarizing: '#0ea5e9',
    accent: '#8b5cf6',       // Purple (for graph nodes)
    overlay: 'rgba(0, 0, 0, 0.5)'
};

const COLORS = {
    scope: '#7950f2',     // Deep Purple
    type: '#fd7e14',      // Professional Orange
    file: '#228be6',      // Blue
    folder: '#343a40',    // Grey
    operation: '#12b886', // Teal
    text: '#f1f3f5'
};

export const EDGE_COLORS = {
    invokes: '#5c7cfa',     // Blue
    declares: '#fab005',    // Yellow
    requires: '#fa5252',    // Red
    specializes: '#be4bdb', // Purple
    instantiates: '#12b886',// Teal
    aggregated: '#adb5bd',  // Neutral Grey
    uses: '#868e96',        // Grey
    typed: '#e64980'        // Pink
};

export const formatKey = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

// ============================================================================
// 2. LAYOUT OPTIONS (This was missing!)
// ============================================================================

export const layoutOptions = {
    name: 'fcose',
    quality: 'proof',
    randomize: false, 
    animate: true, 
    animationDuration: 800,
    animationEasing: 'ease-out-cubic',
    fit: false, 
    padding: 30,
    nodeDimensionsIncludeLabels: true, 
    uniformNodeDimensions: false,
    packComponents: true,   
    nodeRepulsion: 6500,    
    idealEdgeLength: 80,   
    edgeElasticity: 0.45,
    nestingFactor: 0.1,     
    gravity: 0.25,
    numIter: 2500,
    tile: true,             
    tilingPaddingVertical: 20,
    tilingPaddingHorizontal: 20,
    minTemperature: 0.05 
};

// ============================================================================
// 3. STYLESHEET
// ============================================================================

export const saboStylesheet = [
    // ================================================================
    // 1. BASE NODE (Default = Icon Style)
    // ================================================================
    {
        selector: 'node',
        style: {
            'label': 'data(simpleName)',
            'color': COLORS.text,
            'font-family': '"JetBrains Mono", "Fira Code", Inter, monospace',
            'font-size': '12px',
            'font-weight': 500,
            
            // --- TEXT BELOW (Standard Icon View) ---
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            
            // Text Background for readability over edges
            'text-background-color': '#121212',
            'text-background-opacity': 0.8,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',

            // Default Geometry (Fixed Icon Size)
            'shape': 'round-rectangle',
            'width': 24,
            'height': 24,
            'padding': 0,

            // Interaction
            'overlay-padding': '6px', // Easier to click
            'z-index': 2,

            'transition-duration': '0.2s'
        }
    },

    // ================================================================
    // 2. LEAF NODES (Icons)
    // ================================================================

    // --- NODE_FILE (Blue Doc Icon) ---
    {
        selector: '.File',
        style: {
            'background-color': COLORS.file,
            'shape': 'round-rectangle', // Looks like a file
            'width': 20,
            'height': 24, // Taller than wide = Document
            'border-width': 0
        }
    },

    // --- NODE_TYPE (Orange Component Icon) ---
    {
        selector: '.Type',
        style: {
            'background-color': COLORS.type,
            'shape': 'round-rectangle',
            'width': 22,
            'height': 22,
            'border-width': 0
        }
    },

    // --- NODE_SCOPE (Purple Package Icon) ---
    {
        selector: '.Scope',
        style: {
            'shape': 'cut-rectangle', // Package shape
            'background-color': COLORS.scope,
            'width': 26,
            'height': 26,
            'border-width': 0
        }
    },

    // --- NODE_OPERATION (Small Green Dot) ---
    {
        selector: '.Operation',
        style: {
            'shape': 'ellipse',
            'width': 12,
            'height': 12,
            'background-color': COLORS.operation,
            'border-width': 1,
            'border-color': '#121212'
        }
    },

    // --- NODE_FOLDER (Empty Folder Icon) ---
    // If a folder has no children, it's just a grey icon
    {
        selector: '.Folder',
        style: {
            'background-color': COLORS.folder,
            'width': 24,
            'height': 20
        }
    },

    // ================================================================
    // 3. CONTAINER STATES (Overrides for Parents)
    // ================================================================
    // EXPANDED CONTAINER (Open Wrapper)
    {
        selector: 'node[?hasChildren][?expanded]',
        style: {
            'text-valign': 'top', 
            'text-halign': 'center',
            'text-margin-y': -10,
            'text-background-opacity': 0,
            
            'background-color': '#141517', 
            'background-opacity': 0.6,
            
            'border-width': 1,
            'border-style': 'dashed', 
            'border-color': '#5c5f66',
            
            'width': 'auto',
            'height': 'auto',
            'padding': '12px',
            'z-index': 1
        }
    },

    // COLLAPSED CONTAINER (Closed Stack - The Fix)
    {
        selector: 'node[?hasChildren][!expanded]',
        style: {
            // 1. FORCE TEXT INSIDE (Critical Fix)
            'text-valign': 'center',
            'text-halign': 'center',
            'text-margin-y': 0,
            
            // 2. SAFETY DIMENSIONS (Prevents disappearing)
            'min-width': '60px',
            'min-height': '30px',

            // 3. VISUALS
            'color': '#fff', 
            'text-background-opacity': 0, // No dark box behind text inside the button
            'background-opacity': 1,
            
            // Double Border = "Stack of cards" look
            'border-width': 3,
            'border-style': 'double', 
            'border-color': 'rgba(255,255,255,0.4)',
            
            // Sizing: Grow to fit text
            'width': 'label',
            'height': 'label',
            'padding': '12px'
        }
    },

    // ================================================================
    // 4. SELECTION & EDGES (Standard)
    // ================================================================
    {
        selector: 'node:selected',
        style: {
            'border-width': 2,
            'border-color': '#fff',
            'border-style': 'solid',
            'shadow-blur': 15,
            'shadow-color': THEME.primary,
            'shadow-opacity': 0.6,
            'z-index': 999
        }
    },
    // Don't fill expanded containers when selected
    {
        selector: 'node[?hasChildren][?expanded]:selected',
        style: {
            'background-color': '#fff',
            'background-opacity': 0.05,
            'border-color': THEME.primary
        }
    },
    {
        selector: 'edge',
        style: {
            'width': 1.5,
            'curve-style': 'bezier',
            'line-color': '#555',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#555',
            'arrow-scale': 0.9,
            'opacity': 0.5,
            'z-index': 1
        }
    },
    {
        selector: 'edge:hover',
        style: {
            'width': 3,
            'line-color': '#aaa',
            'target-arrow-color': '#aaa',
            'opacity': 1,
            'z-index': 999
        }
    },
    // ================================================================
    // 5. AGGREGATED (LIFTED) EDGES
    // ================================================================
    {
        selector: 'edge[?isAggregated]',
        style: {
            // 1. DYNAMIC WIDTH: Thicker line = More dependencies
            // We use a log function so 1000 edges don't make a 1000px wide line
            'width': (ele) => Math.min(12, 3 + Math.log2(ele.data('weight') || 1)),

            // 2. DASHED STYLE: Indicates "Virtual/Implicit" connection
            'line-style': 'dashed',
            'line-dash-pattern': [8, 4], 

            // 3. COLOR: Neutral Grey (Architecture layer)
            'line-color': '#adb5bd', 
            'target-arrow-color': '#adb5bd',
            'target-arrow-shape': 'triangle',
            
            // 4. LABEL: Show the Count (e.g., "15")
            'label': 'data(weight)',
            'font-size': '10px',
            'font-weight': 'bold',
            'color': '#fff',
            'text-background-color': '#121212',
            'text-background-opacity': 1,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            
            'opacity': 0.8,
            'z-index': 1
        }
    },
    ...Object.entries(EDGE_COLORS).map(([type, color]) => ({
        selector: `edge[label = "${type}"]`,
        style: {
            'line-color': color,
            'target-arrow-color': color,
            'opacity': 0.7
        }
    })),
    // ... Trace Styles ...
    {
        selector: '.trace-active',
        style: { 'border-color': '#ff6b6b', 'border-width': 2, 'shadow-blur': 20, 'shadow-color': '#ff6b6b' }
    },
    {
        selector: '.trace-source',
        style: { 'border-style': 'double', 'border-width': 3, 'border-color': COLORS.file }
    },
    {
        selector: '.trace-call-edge',
        style: { 'width': 3, 'line-style': 'dashed', 'line-dash-pattern': [5, 5], 'line-color': '#ff6b6b', 'target-arrow-color': '#ff6b6b', 'opacity': 1, 'z-index': 999 }
    },
    {
        selector: '.feature-dim',
        style: {
            'opacity': 0.1, // Dim nodes that aren't part of the feature
            'transition-property': 'opacity',
            'transition-duration': '0.3s'
        }
    },
    {
        selector: 'node.feature-highlight',
        style: {
            'opacity': 1,
            'border-width': 4,
            'border-color': '#8b5cf6', // Purple (THEME.accent)
            'background-color': '#8b5cf6',
            'background-opacity': 0.2,
            'text-background-opacity': 1,
            'z-index': 9999
        }
    },
    {
        selector: 'edge.feature-highlight',
        style: {
            'opacity': 1,
            'width': 4,
            'line-color': '#8b5cf6',
            'target-arrow-color': '#8b5cf6',
            'z-index': 999
        }
    }
];