import React from 'react';
import { THEME, EDGE_COLORS } from '../../config/graphConfig';

// --- CONFIGURATION ---
const BADGE_KEYS = new Set([
    'kind', 'visibility', 'modifier', 'Action Type', 'type', 
    'isAbstract', 'isStatic', 'isConstructor', 'isVolatile'
]);

// Keys that should be rendered as Code Blocks
const CODE_KEYS = new Set([
    'id', 'simpleName', 'Parameters', 'ReturnType', 'namespace', 
    'Operation', 'signature', 'declares', 'sourceId', 'targetId', 
    'source', 'target', 'System ID',
    'fullPath', 'path', 'file', 'location', 'uri', 'directory' 
]);

const STATUS_KEYS = new Set(['Message', 'message', 'status', 'error']);

const DetailsPanel = ({ selectedElement, onClose, onToggleLock, lockedNodeIds, activeTraceAction, features = [] }) => {
    
    if (!selectedElement) return null;

    const { 
        id, label, simpleName, 
        source, target, 
        breakdown, weight, isAggregated,
        participating_features
    } = selectedElement;

    // --- CONTEXT ---
    const isTraceEdge = id === 'trace-ghost-edge';
    const isEdge = source && target;
    const isNode = !isEdge && !isAggregated;
    const isLocked = lockedNodeIds && id ? lockedNodeIds.has(id) : false;

    // --- PREPARE PROPERTIES ---
    let displayProperties = selectedElement.properties || {};

    if (isTraceEdge && activeTraceAction) {
        displayProperties = {
            "Trace Step": activeTraceAction.step,
            "Action Type": activeTraceAction.type,
            "Parameters": activeTraceAction.parameters,
            "Message": activeTraceAction.message,
            "Operation": activeTraceAction.simpleName,
            "Timestamp": activeTraceAction.timestamp
        };
    }

    // --- HEADER ---
    let headerColor = 'rgba(255, 255, 255, 0.05)';
    let badgeText = label || "NODE";
    let title = simpleName || displayProperties?.simpleName || id;

    if (isTraceEdge) {
        headerColor = 'rgba(214, 51, 132, 0.2)'; 
        badgeText = "TRACE EXECUTION";
        title = activeTraceAction ? activeTraceAction.simpleName : "Trace Step";
    } else if (isAggregated) { 
        headerColor = 'rgba(139, 92, 246, 0.2)';
        badgeText = "AGGREGATE GROUP";
        title = `Connections (${weight || 'Many'})`;
    } else if (isEdge) {
        headerColor = 'rgba(59, 130, 246, 0.2)';
        badgeText = "RELATIONSHIP";
        title = formatKey(label || '');
    }

    // --- SMART VALUE RENDERER ---
    const renderValue = (key, val) => {
        if (val === null || val === undefined || val === "") return <span style={{color: '#555'}}>-</span>;

        if (typeof val === 'boolean') {
            return <span style={{color: val ? THEME.success : '#666', fontWeight: 600, fontSize: '11px'}}>{val.toString().toUpperCase()}</span>;
        }

        if (BADGE_KEYS.has(key)) {
            let bg = '#444'; 
            if (val === 'return') bg = '#d6336c';
            else if (val === 'call') bg = '#228be6';
            else if (val === 'public') bg = '#10b981';
            else if (val === 'private') bg = '#ef4444';
            else if (val === 'protected') bg = '#f59e0b';
            return <span style={{...styles.badgeValue, backgroundColor: bg}}>{val}</span>;
        }

        if (STATUS_KEYS.has(key) && typeof val === 'string') {
            if (val.includes('FAIL') || val.includes('ERROR')) return <span style={{color: THEME.danger, fontWeight: '800'}}>{val}</span>;
            if (val.includes('OK') || val.includes('SUCCESS')) return <span style={{color: THEME.success, fontWeight: '700'}}>{val}</span>;
        }

        if (CODE_KEYS.has(key) || key === 'id') {
            return <code style={styles.codeBlock}>{val}</code>;
        }

        if (typeof val === 'object') {
            if (Object.keys(val).length === 0) return <span style={{fontStyle: 'italic', color: '#666'}}>empty</span>;
            return (
                <div style={styles.nestedContainer}>
                    {Object.entries(val).map(([k, v]) => (
                        <div key={k} style={styles.row}>
                            <strong style={styles.keyLabel}>{formatKey(k)}:</strong> {renderValue(k, v)}
                        </div>
                    ))}
                </div>
            );
        }

        return <span style={styles.valueText}>{String(val)}</span>;
    };

    const associatedFeatures = (participating_features || []).map(featId => {
        return features.find(f => f.id === featId);
    }).filter(Boolean);

    return (
        <div style={styles.panel}>
            {/* HEADER */}
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
                            title={isLocked ? "Unlock" : "Lock"}>
                            {isLocked ? "🔓" : "🔒"}
                        </button>
                    )}
                </div>
                <button onClick={onClose} style={styles.closeBtn}>×</button>
            </div>

            <div style={styles.content}>
                {/* 1. EDGE CONNECTIONS (Now visible for ALL edges, including Trace) */}
                {isEdge && (
                    <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>Connections</h4>
                        <div style={styles.row}>
                            <strong style={styles.keyLabel}>Source:</strong> {renderValue('source', source)}
                        </div>
                        <div style={styles.row}>
                            <strong style={styles.keyLabel}>Target:</strong> {renderValue('target', target)}
                        </div>
                    </div>
                )}

                {/* 2. AGGREGATION */}
                {isAggregated && breakdown && (
                    <div style={styles.section}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                            <h4 style={{...styles.sectionTitle, marginBottom: 0}}>Edge Composition</h4>
                            <span style={styles.totalBadge}>Total: {weight}</span>
                        </div>
                        <div style={styles.breakdownList}>
                            {Object.entries(breakdown).map(([type, count]) => (
                                <div key={type} style={{...styles.row, alignItems: 'center'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
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

                {/* 3. PROPERTIES */}
                {displayProperties && Object.keys(displayProperties).length > 0 && (
                    <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>Properties</h4>
                        {Object.entries(displayProperties).map(([key, value]) => (
                            <div key={key} style={styles.row}>
                                <strong style={styles.keyLabel}>{formatKey(key)}:</strong> 
                                <div style={{flex: 1, display: 'flex', justifyContent: 'flex-end', maxWidth: '70%'}}>
                                    {renderValue(key, value)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {associatedFeatures.length > 0 && (
                    <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>Participating Features</h4>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                            {associatedFeatures.map(feat => (
                                <span key={feat.id} style={{
                                    ...styles.badgeValue, 
                                    backgroundColor: feat.category === 'Infrastructure' ? '#444' : '#7950f2',
                                    fontSize: '11px', 
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                }}>
                                    {feat.category === 'Infrastructure' ? '⚙️' : '🧩'} {feat.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 4. ID */}
                <div style={{...styles.section, borderBottom: 'none', paddingTop: '10px'}}>
                    <div style={styles.row}>
                        <strong style={styles.keyLabel}>System ID:</strong> 
                        <div style={{flex: 1, display: 'flex', justifyContent: 'flex-end', maxWidth: '70%'}}>
                            {renderValue('id', id)} 
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const formatKey = (key) => key ? key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) : "";

// --- STYLES ---
const styles = {
    panel: {
        position: 'absolute', top: 20, right: 20, bottom: 20, width: '320px',
        backgroundColor: 'rgba(30, 30, 30, 0.95)', backdropFilter: 'blur(16px)',
        border: `1px solid ${THEME.border}`, borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', flexDirection: 'column', color: THEME.textMain,
        animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
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
        margin: '0 0 10px 0', fontSize: '10px', textTransform: 'uppercase', 
        letterSpacing: '1px', color: '#666', fontWeight: 700
    },
    row: { 
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', 
        padding: '4px 0', gap: '12px' 
    },
    keyLabel: { 
        color: '#adb5bd', minWidth: '85px', fontWeight: 500, fontSize: '12px',
        flexShrink: 0
    },
    valueText: { 
        wordBreak: 'break-word', color: '#e0e0e0', textAlign: 'right', fontSize: '12px' 
    },
    
    // --- SPECIAL RENDERERS ---
    codeBlock: { 
        fontFamily: "'Fira Code', 'Roboto Mono', monospace", 
        fontSize: '11px', color: '#e0e0e0', background: 'rgba(255,255,255,0.08)', 
        padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all', display: 'inline-block'
    },
    badgeValue: {
        color: '#fff', padding: '2px 8px', borderRadius: '12px',
        fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: '0.5px', display: 'inline-block'
    },
    nestedContainer: {
        paddingLeft: '10px', borderLeft: `2px solid #444`,
        marginTop: '4px', marginBottom: '8px', width: '100%'
    },
    breakdownList: {
        background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px 12px'
    },
    totalBadge: {
        fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.1)',
        padding: '2px 6px', borderRadius: '4px', color: '#fff', fontWeight: 600
    },
    headerBtn: {
        color: '#fff', fontSize: '14px', cursor: 'pointer', padding: '4px 8px',
        borderRadius: '4px', transition: 'all 0.2s', marginRight: '5px',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    }
};

if (!document.getElementById("details-panel-style")) {
    const styleSheet = document.createElement("style");
    styleSheet.id = "details-panel-style";
    styleSheet.innerText = `@keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(styleSheet);
}

export default DetailsPanel;