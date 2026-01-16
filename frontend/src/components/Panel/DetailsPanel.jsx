import React from 'react';
import { THEME, EDGE_COLORS } from '../../config/graphConfig';

const DetailsPanel = ({ selectedElement, onClose, onToggleLock, lockedNodeIds }) => {
    if (!selectedElement) return null;

    const { 
        id, label, simpleName, properties, 
        source, target, step, message,
        breakdown, weight, isAggregated
    } = selectedElement;

    const isEdge = source && target;

    const isNode = !isEdge && !isAggregated;
    const isLocked = lockedNodeIds ? lockedNodeIds.has(id) : false;
    
    // Header Logic
    let headerColor = 'rgba(255, 255, 255, 0.05)';
    let badgeText = label || "NODE";

    if (id === 'trace-ghost-edge') {
        headerColor = 'rgba(214, 51, 132, 0.2)'; 
        badgeText = "TRACE STEP";
    } else if (isAggregated) { 
        headerColor = 'rgba(139, 92, 246, 0.2)';
        badgeText = "AGGREGATE GROUP";
    } else if (isEdge) {
        headerColor = 'rgba(59, 130, 246, 0.2)';
        badgeText = "RELATIONSHIP";
    }

    const title = isEdge 
        ? (isAggregated ? `Connections (${weight || 'Many'})` : formatKey(label))
        : (simpleName || properties?.simpleName || id);

    // Renderer
    const renderValue = (val) => {
        if (val === null || val === undefined) return <span style={{color: '#666'}}>N/A</span>;
        if (typeof val === 'boolean') return <span style={{color: THEME.warning}}>{val.toString()}</span>;
        
        if (typeof val === 'object') {
            if (Object.keys(val).length === 0) return <span style={{fontStyle: 'italic', color: '#666'}}>empty</span>;
            return (
                <div style={styles.nestedContainer}>
                    {Object.entries(val).map(([k, v]) => (
                        <div key={k} style={styles.row}>
                            <strong style={styles.keyLabel}>{formatKey(k)}:</strong> {renderValue(v)}
                        </div>
                    ))}
                </div>
            );
        }
        return <span style={styles.valueText}>{String(val)}</span>;
    };

    return (
        <div style={styles.panel}>
            {/* Header */}
            <div style={{...styles.header, background: headerColor}}>
                <div style={{flex: 1, overflow: 'hidden'}}>
                    <div style={styles.badge}>{badgeText}</div>
                    <h3 style={styles.title} title={title}>{title}</h3>
                </div>

                <div style={{display:'flex', alignItems:'center', gap:'5px'}}>
                    {isNode && (
                        <button
                            onClick={() => onToggleLock(id)}
                            style={{
                                ...styles.headerBtn,
                                background: isLocked ? 'rgba(139, 92, 246, 0.6)' : 'rgba(255,255,255,0.1)',
                                border: isLocked ? `1px solid ${THEME.primary}` : 'none'
                            }}
                            title={isLocked ? "Unlock (Remove from focus)" : "Lock (Focus on this node)"}>
                            {isLocked ? "🔓" : "🔒"}
                        </button>
                    )}
                </div>

                <button onClick={onClose} style={styles.closeBtn}>×</button>
            </div>

            {/* Content */}
            <div style={styles.content}>
                {isAggregated && breakdown && (
                    <div style={styles.section}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                            <h4 style={{...styles.sectionTitle, marginBottom: 0}}>Edge Composition</h4>
                            <span style={styles.totalBadge}>Total: {weight}</span>
                        </div>
                        
                        <div style={styles.breakdownList}>
                            {Object.entries(breakdown).map(([type, count]) => (
                                <div key={type} style={{...styles.row, alignItems: 'center'}}> {/* <--- Force center alignment here */}
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        {/* Color Dot */}
                                        <div style={{
                                            width: '8px', height: '8px', borderRadius: '50%', 
                                            backgroundColor: EDGE_COLORS[type] || '#999',
                                            boxShadow: `0 0 5px ${EDGE_COLORS[type] || '#999'}40`
                                        }}/>
                                        <strong style={styles.keyLabel}>{formatKey(type)}</strong>
                                    </div>
                                    <span style={styles.valueText}>{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={styles.section}>
                    <div style={styles.row}>
                        <strong style={styles.keyLabel}>ID:</strong> 
                        <span style={styles.code}>{id}</span>
                    </div>
                </div>

                {(step !== undefined || message) && (
                    <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>Trace Info</h4>
                        {step !== undefined && (
                            <div style={styles.row}>
                                <strong style={styles.keyLabel}>Step:</strong> 
                                <span style={{color: THEME.primary, fontWeight: 'bold'}}>{step}</span>
                            </div>
                        )}
                        {message && <div style={styles.messageBox}>{message}</div>}
                    </div>
                )}

                {isEdge && (
                    <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>Connections</h4>
                        <div style={styles.row}>
                            <strong style={styles.keyLabel}>Source:</strong> <span style={styles.code}>{source}</span>
                        </div>
                        <div style={styles.row}>
                            <strong style={styles.keyLabel}>Target:</strong> <span style={styles.code}>{target}</span>
                        </div>
                    </div>
                )}

                {properties && Object.keys(properties).length > 0 && (
                    <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>Properties</h4>
                        {Object.entries(properties).map(([key, value]) => (
                            <div key={key} style={styles.row}>
                                <strong style={styles.keyLabel}>{formatKey(key)}:</strong> {renderValue(value)}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- HELPER FUNCTION ---
const formatKey = (key) => {
    if (!key) return "";
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

// --- STYLES ---
const styles = {
    panel: {
        position: 'absolute', top: 20, right: 20, bottom: 20, width: '300px',
        backgroundColor: 'rgba(30, 30, 30, 0.9)', backdropFilter: 'blur(12px)',
        border: `1px solid ${THEME.border}`, borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 1000,
        display: 'flex', flexDirection: 'column', color: THEME.textMain,
        animation: 'slideInRight 0.3s ease-out'
    },
    header: {
        padding: '16px', borderBottom: `1px solid ${THEME.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'start',
        borderTopLeftRadius: '12px', borderTopRightRadius: '12px'
    },
    badge: {
        fontSize: '10px', fontWeight: 800, letterSpacing: '1px',
        color: THEME.textMuted, marginBottom: '4px', textTransform: 'uppercase'
    },
    title: {
        margin: 0, fontSize: '14px', fontWeight: 600,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
    },
    closeBtn: {
        background: 'transparent', border: 'none', color: THEME.textMuted, 
        fontSize: '20px', cursor: 'pointer', lineHeight: '20px', padding: 0, marginLeft: '10px'
    },
    content: { padding: '16px', fontSize: '13px', lineHeight: '1.6', overflowY: 'auto', flex: 1 },
    section: { marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
    sectionTitle: {
        margin: '0 0 10px 0', fontSize: '11px', textTransform: 'uppercase', 
        letterSpacing: '1px', color: THEME.textMuted, fontWeight: 700
    },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '2px 0', gap: '8px' },
    keyLabel: { color: '#adb5bd', minWidth: '80px', fontWeight: 500, fontSize: '12px' },
    valueText: { wordBreak: 'break-word', color: '#e0e0e0', textAlign: 'right' },
    code: { 
        fontFamily: "'Fira Code', monospace", fontSize: '11px', color: THEME.primary, 
        background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all'
    },
    nestedContainer: {
        paddingLeft: '10px', borderLeft: `2px solid ${THEME.border}`,
        marginTop: '4px', marginBottom: '8px', width: '100%'
    },
    messageBox: {
        marginTop: '8px', padding: '10px', borderRadius: '6px',
        background: 'rgba(239, 68, 68, 0.1)', border: `1px solid ${THEME.danger}40`,
        color: '#ffcccc', fontSize: '12px', fontStyle: 'italic'
    },
    breakdownList: {
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '8px',
        padding: '8px 12px'
    },
    totalBadge: {
        fontSize: '10px',
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: '2px 6px',
        borderRadius: '4px',
        color: '#fff',
        fontWeight: 600
    },
    headerBtn: {
        color: '#fff', fontSize: '14px', cursor: 'pointer', padding: '4px 8px',
        borderRadius: '4px', transition: 'all 0.2s', marginRight: '5px',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    }
};

// Animation
if (!document.getElementById("details-panel-style")) {
    const styleSheet = document.createElement("style");
    styleSheet.id = "details-panel-style";
    styleSheet.innerText = `@keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(styleSheet);
}

export default DetailsPanel;