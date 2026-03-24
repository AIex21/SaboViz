import React, { useState } from 'react';
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

const DetailsPanel = ({ selectedElement, onClose, onToggleLock, lockedNodeIds, onToggleEdgeFocus, edgeFocusNodeIds, activeTraceAction, features = [], onSummarizeNode, onRevealAggregatedMember, onRevealAggregatedMemberDependencies, isProjectSummarizing = false }) => {
    const [isSummarizingNode, setIsSummarizingNode] = useState(false);
    
    if (!selectedElement) return null;

    const { 
        id, label, simpleName, 
        source, target, 
        breakdown, weight, isAggregated,
        participating_features,
        aggregateMembers,
        aggregateContextLabel,
        ai_summary
    } = selectedElement;

    const dependencyScopeLabel = aggregateContextLabel === 'feature scope' ? 'feature scope' : 'locked scope';

    // --- CONTEXT ---
    const isTraceEdge = id === 'trace-ghost-edge';
    const isEdge = source && target;
    const isAggregateNode = !isEdge && Boolean(selectedElement.isAggregateNode);
    const isAggregatedEdge = isEdge && Boolean(isAggregated);
    const isNode = !isEdge && !isAggregated;
    const isLocked = lockedNodeIds && id ? lockedNodeIds.has(String(id)) : false;
    const isEdgeFocused = edgeFocusNodeIds && id ? edgeFocusNodeIds.has(String(id)) : false;

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
    } else if (isAggregateNode) {
        headerColor = 'rgba(56, 189, 248, 0.16)';
        badgeText = "AGGREGATED NODE";
        title = `${simpleName || 'Aggregated Group'}`;
    } else if (isAggregatedEdge) { 
        headerColor = 'rgba(56, 189, 248, 0.16)';
        badgeText = "AGGREGATE GROUP";
        title = `Connections (${weight || 'Many'})`;
    } else if (isEdge) {
        headerColor = 'rgba(59, 130, 246, 0.2)';
        badgeText = "RELATIONSHIP";
        title = formatKey(label || '');
    }

    // --- SMART VALUE RENDERER ---
    const renderValue = (key, val, isStacked = CSSFontFeatureValuesRule) => {
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

        if (Array.isArray(val)) {
            if (val.length === 0) return <span style={{fontStyle: 'italic', color: '#667'}}>empty</span>;
            return (
                <ul style={{margin: '4px 0 0 0', paddingLeft: '16px', color: '#e0e0e0', fontSize: '12px', textAlign: 'left', width: '100%' }}>
                    {val.map((item, i) => <li key={i} style={{marginBottom: '4px'}}>{item}</li>)}
                </ul>
            )
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

        return <span style={{...styles.valueText, textAlign: isStacked ? 'left' : 'right'}}>{String(val)}</span>;
    };

    const associatedFeatures = (participating_features || []).map(featId => {
        return features.find(f => f.id === featId);
    }).filter(Boolean);

    const handleSummarizeNode = async () => {
        if (!onSummarizeNode || !isNode || isSummarizingNode || isProjectSummarizing) return;
        setIsSummarizingNode(true);
        try {
            await onSummarizeNode(id);
        } finally {
            setIsSummarizingNode(false);
        }
    };

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
                        <>
                            <button
                                onClick={handleSummarizeNode}
                                disabled={isSummarizingNode || isProjectSummarizing}
                                style={{
                                    ...styles.headerBtn,
                                    background: 'rgba(139, 92, 246, 0.25)',
                                    border: '1px solid rgba(139, 92, 246, 0.65)',
                                    opacity: (isSummarizingNode || isProjectSummarizing) ? 0.6 : 1,
                                    cursor: (isSummarizingNode || isProjectSummarizing) ? 'not-allowed' : 'pointer'
                                }}
                                title={isProjectSummarizing ? "Project summarization is in progress" : "Summarize this node"}
                            >
                                {isSummarizingNode ? '...' : '✨'}
                            </button>
                            <button
                                onClick={() => onToggleEdgeFocus && onToggleEdgeFocus(id)}
                                style={{
                                    ...styles.headerBtn,
                                    background: isEdgeFocused ? 'rgba(34, 211, 238, 0.3)' : 'rgba(255,255,255,0.1)',
                                    border: isEdgeFocused ? '1px solid #22d3ee' : 'none'
                                }}
                                title={isEdgeFocused ? "Disable edge focus" : "Show only incoming/outgoing edges"}>
                                ↔
                            </button>
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
                        </>
                    )}
                </div>
                <button onClick={onClose} style={styles.closeBtn}>×</button>
            </div>

            <div style={styles.content}>
                {/* EDGE CONNECTIONS (Now visible for ALL edges, including Trace) */}
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

                {/* AGGREGATION */}
                {isAggregatedEdge && breakdown && (
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

                {isAggregateNode && (
                    <div style={styles.section}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                            <h4 style={{...styles.sectionTitle, marginBottom: 0}}>Members</h4>
                            <span style={styles.totalBadge}>Total: {(aggregateMembers || []).length}</span>
                        </div>

                        {(aggregateMembers || []).length === 0 ? (
                            <div style={styles.emptyText}>No members available.</div>
                        ) : (
                            <div style={styles.memberList}>
                                {(aggregateMembers || []).map((member) => (
                                    <div key={member.id} style={styles.memberRow}>
                                        <div style={styles.memberInfo}>
                                            <strong style={styles.memberName} title={member.simpleName}>{member.simpleName}</strong>
                                            <div style={styles.memberStatsRow}>
                                                <span style={styles.memberTypeBadge}>{member.type}</span>
                                                <span style={{...styles.memberDepsBadge, ...(member.hasEdgeWithLocked ? styles.memberDepsOn : styles.memberDepsOff)}}>
                                                    {member.hasEdgeWithLocked ? `${member.lockedEdgeCount} edge(s) to ${dependencyScopeLabel}` : `No edge to ${dependencyScopeLabel}`}
                                                </span>
                                            </div>
                                            {member.lockedEdgeBreakdown && Object.keys(member.lockedEdgeBreakdown).length > 0 && (
                                                <span style={styles.memberBreakdown}>
                                                    {Object.entries(member.lockedEdgeBreakdown)
                                                        .map(([kind, count]) => `${formatKey(kind)}: ${count}`)
                                                        .join(' | ')}
                                                </span>
                                            )}
                                        </div>

                                        <div style={styles.memberActions}>
                                            <button
                                                onClick={() => onRevealAggregatedMember && onRevealAggregatedMember(member.id)}
                                                style={styles.revealBtn}
                                                title="Reveal this node from aggregate"
                                            >
                                                Reveal node
                                            </button>

                                            <button
                                                onClick={() => onRevealAggregatedMemberDependencies && onRevealAggregatedMemberDependencies(id, member.id, member.lockedEdgesByNeighbor || {})}
                                                style={styles.depsBtn}
                                                disabled={!member.hasEdgeWithLocked}
                                                title={member.hasEdgeWithLocked ? (member.depsShown ? `Hide dependencies to ${dependencyScopeLabel}` : `Show dependencies to ${dependencyScopeLabel}`) : `No dependencies to ${dependencyScopeLabel}`}
                                            >
                                                {member.depsShown ? 'Hide edges' : 'Show edges'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* PROPERTIES */}
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

                {/* ID */}
                <div style={{...styles.section, borderBottom: 'none', paddingTop: '10px'}}>
                    <div style={styles.row}>
                        <strong style={styles.keyLabel}>System ID:</strong> 
                        <div style={{flex: 1, display: 'flex', justifyContent: 'flex-end', maxWidth: '70%'}}>
                            {renderValue('id', id)} 
                        </div>
                    </div>
                </div>

                {/* AI SUMMARY */}
                {ai_summary && Object.keys(ai_summary).length > 0 && (
                    <div style={{...styles.section, backgroundColor: 'rgba(139, 92, 246, 0.08)', padding: '12px', borderRadius: '8px', border: `1px solid rgba(139, 92, 246, 0.3)`}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px'}}>
                            <span style={{fontSize: '14px'}}>✨</span>
                            <h4 style={{...styles.sectionTitle, margin: 0, color: '#b197fc'}}>AI Summary</h4>
                        </div>
                        {Object.entries(ai_summary).map(([key, value]) => (
                            <div key={key} style={styles.stackedRow}>
                                <strong style={{...styles.keyLabel, color: '#b197fc', opacity: 0.8}}>{formatKey(key)}</strong> 
                                <div style={{width: '100%', marginTop: '2px'}}>
                                    {renderValue(key, value, true)} {/* Pass true to force left alignment */}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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
    stackedRow: {
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        padding: '6px 0', gap: '4px',
        borderBottom: '1px dashed rgba(139, 92, 246, 0.2)',
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
    memberList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    totalBadge: {
        fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.1)',
        padding: '2px 6px', borderRadius: '4px', color: '#fff', fontWeight: 600
    },
    emptyText: {
        color: '#9097a1',
        fontSize: '12px',
        fontStyle: 'italic'
    },
    headerBtn: {
        color: '#fff', fontSize: '14px', cursor: 'pointer', padding: '4px 8px',
        borderRadius: '4px', transition: 'all 0.2s', marginRight: '5px',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    },
    revealBtn: {
        background: 'rgba(148, 163, 184, 0.14)',
        border: '1px solid rgba(148, 163, 184, 0.55)',
        color: '#e5e7eb',
        borderRadius: '8px',
        padding: '5px 10px',
        fontSize: '11px',
        fontWeight: 700,
        cursor: 'pointer',
        minWidth: '92px',
        textAlign: 'center'
    },
    depsBtn: {
        background: 'rgba(71, 85, 105, 0.25)',
        border: '1px solid rgba(100, 116, 139, 0.6)',
        color: '#cbd5e1',
        borderRadius: '8px',
        padding: '5px 10px',
        fontSize: '11px',
        fontWeight: 700,
        cursor: 'pointer',
        minWidth: '92px',
        textAlign: 'center'
    },
    memberRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)'
    },
    memberInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: 0,
        flex: 1
    },
    memberName: {
        color: '#e8eef5',
        fontSize: '12px',
        fontWeight: 700,
        lineHeight: 1.35,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    memberStatsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap'
    },
    memberTypeBadge: {
        fontSize: '10px',
        color: '#e2e8f0',
        padding: '2px 7px',
        borderRadius: '999px',
        border: '1px solid rgba(148, 163, 184, 0.5)',
        backgroundColor: 'rgba(71, 85, 105, 0.35)',
        fontWeight: 700,
        letterSpacing: '0.2px'
    },
    memberDepsBadge: {
        fontSize: '10px',
        padding: '2px 7px',
        borderRadius: '999px',
        fontWeight: 700,
        letterSpacing: '0.2px'
    },
    memberDepsOn: {
        color: '#d1fae5',
        border: '1px solid rgba(16, 185, 129, 0.6)',
        backgroundColor: 'rgba(16, 185, 129, 0.15)'
    },
    memberDepsOff: {
        color: '#cbd5e1',
        border: '1px solid rgba(148, 163, 184, 0.45)',
        backgroundColor: 'rgba(71, 85, 105, 0.2)'
    },
    memberActions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: 'flex-end'
    },
    memberBreakdown: {
        color: '#9fb0c2',
        fontSize: '10px',
        lineHeight: 1.3
    }
};

if (!document.getElementById("details-panel-style")) {
    const styleSheet = document.createElement("style");
    styleSheet.id = "details-panel-style";
    styleSheet.innerText = `@keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(styleSheet);
}

export default DetailsPanel;