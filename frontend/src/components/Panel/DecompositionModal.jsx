import React, { useState } from 'react';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const DecompositionModal = ({ project, onClose, onConfirm }) => {
    const [decompositionMethod, setDecompositionMethod] = useState('agglomerative');
    const [distanceThreshold, setDistanceThreshold] = useState(0.4);
    const [infrastructureThreshold, setInfrastructureThreshold] = useState(0.3);
    const [overlapAlpha, setOverlapAlpha] = useState(0.8);
    const [leidenResolution, setLeidenResolution] = useState(3.0);
    const [useAi, setUseAi] = useState(true);

    const [activeTooltip, setActiveTooltip] = useState(null);

    const handleSubmit = () => {
        onConfirm(
            project.id,
            distanceThreshold,
            infrastructureThreshold,
            useAi,
            decompositionMethod,
            overlapAlpha,
            leidenResolution
        );
        onClose();
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={styles.header}>
                    <h3 style={styles.title}>Extract Features for "{project.name}"</h3>
                    <button onClick={onClose} style={styles.closeBtn}>×</button>
                </div>

                {/* Body */}
                <div style={styles.body}>
                    <p style={styles.description}>
                        {decompositionMethod === 'agglomerative'
                            ? 'Configure thresholds for the agglomerative decomposition.'
                            : 'Configure graph-community decomposition.'}
                    </p>

                    <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>Decomposition Method</label>
                        </div>
                        <select
                            value={decompositionMethod}
                            onChange={(e) => setDecompositionMethod(e.target.value)}
                            style={styles.select}
                        >
                            <option value="agglomerative" style={styles.selectOption}>Hierarchical Agglomerative Clustering</option>
                            <option value="graph_community" style={styles.selectOption}>Graph Community</option>
                        </select>
                    </div>

                    {/* Distance Threshold Control */}
                    {decompositionMethod === 'agglomerative' && <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>Distance Threshold</label>
                            <div 
                                style={styles.tooltipContainer}
                                onMouseEnter={() => setActiveTooltip('dist')}
                                onMouseLeave={() => setActiveTooltip(null)}>
                                <span style={styles.questionMark}>?</span>
                                <div style={{
                                    ...styles.tooltipText,
                                    opacity: activeTooltip === 'dist' ? 1 : 0,
                                    visibility: activeTooltip === 'dist' ? 'visible' : 'hidden',
                                    transform: activeTooltip === 'dist' ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(10px)'
                                }}>
                                    Determines how close two execution traces must be to be grouped into the same feature. 
                                    <br/><br/>
                                    <strong>Lower (0.1):</strong> Strict matching. Creates many small, specific features.
                                    <br/>
                                    <strong>Higher (0.8):</strong> Loose matching. Groups distinct functionalities into large blobs.
                                </div>
                            </div>
                            <span style={styles.valueDisplay}>{distanceThreshold}</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="1" step="0.05"
                            value={distanceThreshold}
                            onChange={(e) => setDistanceThreshold(parseFloat(e.target.value))}
                            style={styles.slider}
                        />
                    </div>}

                    {/* Infrastructure Threshold Control */}
                    {decompositionMethod === 'agglomerative' && <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>Infrastructure Threshold</label>
                            <div 
                                style={styles.tooltipContainer}
                                onMouseEnter={() => setActiveTooltip('infra')}
                                onMouseLeave={() => setActiveTooltip(null)}
                                >
                                <span style={styles.questionMark}>?</span>
                                <div style={{
                                    ...styles.tooltipText,
                                    opacity: activeTooltip === 'infra' ? 1 : 0,
                                    visibility: activeTooltip === 'infra' ? 'visible' : 'hidden',
                                    transform: activeTooltip === 'infra' ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(10px)'
                                }}>
                                    Ubiquity Score cut-off. Components used by more than this % of features are marked as "Infrastructure" (e.g., Logger, Utils).
                                    <br/><br/>
                                    <strong>Lower (0.4):</strong> More components marked as generic/infrastructure.
                                    <br/>
                                    <strong>Higher (0.9):</strong> Only the most heavily used components are infrastructure.
                                </div>
                            </div>
                            <span style={styles.valueDisplay}>{infrastructureThreshold}</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="1" step="0.05"
                            value={infrastructureThreshold}
                            onChange={(e) => setInfrastructureThreshold(parseFloat(e.target.value))}
                            style={styles.slider}
                        />
                    </div>}

                    {decompositionMethod === 'graph_community' && <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>Leiden Resolution</label>
                            <div
                                style={styles.tooltipContainer}
                                onMouseEnter={() => setActiveTooltip('resolution')}
                                onMouseLeave={() => setActiveTooltip(null)}
                            >
                                <span style={styles.questionMark}>?</span>
                                <div style={{
                                    ...styles.tooltipText,
                                    opacity: activeTooltip === 'resolution' ? 1 : 0,
                                    visibility: activeTooltip === 'resolution' ? 'visible' : 'hidden',
                                    transform: activeTooltip === 'resolution' ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(10px)'
                                }}>
                                    Controls how finely Leiden splits the co-execution graph into candidate features.
                                    <br/><br/>
                                    <strong>Lower (0.8):</strong> Larger, fewer feature communities.
                                    <br/>
                                    <strong>Higher (4.5):</strong> Smaller, more feature communities.
                                </div>
                            </div>
                            <span style={styles.valueDisplay}>{leidenResolution.toFixed(1)}</span>
                        </div>
                        <input
                            type="range"
                            min="0.5" max="5.0" step="0.1"
                            value={leidenResolution}
                            onChange={(e) => setLeidenResolution(parseFloat(e.target.value))}
                            style={styles.slider}
                        />
                    </div>}

                    {decompositionMethod === 'graph_community' && <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>Overlap Alpha</label>
                            <div
                                style={styles.tooltipContainer}
                                onMouseEnter={() => setActiveTooltip('alpha')}
                                onMouseLeave={() => setActiveTooltip(null)}
                            >
                                <span style={styles.questionMark}>?</span>
                                <div style={{
                                    ...styles.tooltipText,
                                    opacity: activeTooltip === 'alpha' ? 1 : 0,
                                    visibility: activeTooltip === 'alpha' ? 'visible' : 'hidden',
                                    transform: activeTooltip === 'alpha' ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(10px)'
                                }}>
                                    Controls how permissive the overlap assignment is between candidate features.
                                    <br/><br/>
                                    <strong>Lower (0.5):</strong> More shared memberships across features.
                                    <br/>
                                    <strong>Higher (0.9):</strong> Stricter feature boundaries.
                                </div>
                            </div>
                            <span style={styles.valueDisplay}>{overlapAlpha}</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="1" step="0.05"
                            value={overlapAlpha}
                            onChange={(e) => setOverlapAlpha(parseFloat(e.target.value))}
                            style={styles.slider}
                        />
                    </div>}

                    <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>Use AI for Feature Naming & Description</label>
                        </div>
                        <label style={styles.toggleRow}>
                            <input
                                type="checkbox"
                                checked={useAi}
                                onChange={(e) => setUseAi(e.target.checked)}
                                style={styles.checkbox}
                            />
                            <span style={styles.toggleText}>
                                {useAi ? 'Enabled (LLM-assisted labels)' : 'Disabled (rule-based labels only)'}
                            </span>
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <ModalButton variant="secondary" onClick={onClose} style={{marginRight: '10px'}}>
                        Cancel
                    </ModalButton>
                    <ModalButton variant="primary" onClick={handleSubmit}>
                        Start Extraction
                    </ModalButton>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: THEME.overlay,
        backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 2000
    },
    modal: {
        width: '450px',
        backgroundColor: THEME.panelBg,
        border: `1px solid ${THEME.border}`,
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out'
    },
    header: {
        padding: '20px 24px',
        borderBottom: `1px solid ${THEME.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(255,255,255,0.02)'
    },
    title: { margin: 0, color: '#fff', fontSize: '16px', fontWeight: 600 },
    closeBtn: {
        background: 'none', border: 'none', color: THEME.textMuted,
        fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: 1
    },
    body: {
        padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '24px'
    },
    description: {
        margin: '0', fontSize: '13px', color: THEME.textMuted, lineHeight: '1.5'
    },
    controlGroup: {
        display: 'flex', flexDirection: 'column', gap: '8px'
    },
    labelRow: {
        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'
    },
    label: {
        color: '#fff', fontSize: '13px', fontWeight: 500
    },
    valueDisplay: {
        marginLeft: 'auto', color: THEME.primary, fontWeight: '700', fontSize: '13px', fontFamily: 'monospace'
    },
    slider: {
        width: '100%', cursor: 'pointer', accentColor: THEME.primary
    },
    select: {
        border: `1px solid ${THEME.border}`,
        borderRadius: '8px',
        padding: '10px 12px',
        backgroundColor: '#000000',
        color: '#ffffff',
        fontSize: '13px',
    },
    selectOption: {
        backgroundColor: '#000000',
        color: '#ffffff'
    },
    toggleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        border: `1px solid ${THEME.border}`,
        borderRadius: '8px',
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.03)'
    },
    checkbox: {
        width: '16px',
        height: '16px',
        accentColor: THEME.primary,
        cursor: 'pointer'
    },
    toggleText: {
        fontSize: '12px',
        color: THEME.textMuted
    },
    // Tooltip Logic
    tooltipContainer: {
        position: 'relative', display: 'flex', alignItems: 'center', cursor: 'help',
        className: 'tooltip-trigger'
    },
    questionMark: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '16px', height: '16px', borderRadius: '50%',
        backgroundColor: 'rgba(255,255,255,0.1)', color: '#aaa',
        fontSize: '11px', fontWeight: 'bold'
    },
    tooltipText: {
        position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(10px)',
        marginBottom: '10px', width: '250px',
        backgroundColor: '#222', border: '1px solid #444',
        padding: '10px', borderRadius: '6px',
        fontSize: '12px', lineHeight: '1.4', color: '#ddd',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
        opacity: 0, visibility: 'hidden', transition: 'all 0.2s', zIndex: 3000
    },
    footer: {
        padding: '20px 24px',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex', justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.2)'
    }
};

export default DecompositionModal;