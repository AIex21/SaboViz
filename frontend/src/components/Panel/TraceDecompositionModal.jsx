import React, { useState } from 'react';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const TraceDecompositionModal = ({ project, onClose, onConfirm }) => {
    const [peltPenalty, setPeltPenalty] = useState(30.0);
    const [distanceThreshold, setDistanceThreshold] = useState(0.5);
    const [useAi, setUseAi] = useState(true);
    const [activeTooltip, setActiveTooltip] = useState(null);

    const handleSubmit = () => {
        onConfirm(project.id, peltPenalty, distanceThreshold, useAi);
        onClose();
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.header}>
                    <h3 style={styles.title}>Trace Decomposition for "{project.name}"</h3>
                    <button onClick={onClose} style={styles.closeBtn}>x</button>
                </div>

                <div style={styles.body}>
                    <p style={styles.description}>
                        Configure micro-feature segmentation for all traces in this project.
                    </p>

                    <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>PELT Penalty</label>
                            <div
                                style={styles.tooltipContainer}
                                onMouseEnter={() => setActiveTooltip('penalty')}
                                onMouseLeave={() => setActiveTooltip(null)}
                            >
                                <span style={styles.questionMark}>?</span>
                                <div style={{
                                    ...styles.tooltipText,
                                    opacity: activeTooltip === 'penalty' ? 1 : 0,
                                    visibility: activeTooltip === 'penalty' ? 'visible' : 'hidden',
                                    transform: activeTooltip === 'penalty' ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(10px)'
                                }}>
                                    Controls segmentation strictness.
                                    <br /><br />
                                    <strong>Lower penalty:</strong> more boundaries and smaller micro-features.
                                    <br />
                                    <strong>Higher penalty:</strong> fewer boundaries and larger micro-features.
                                </div>
                            </div>
                            <span style={styles.valueDisplay}>{peltPenalty.toFixed(1)}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={peltPenalty}
                            onChange={(e) => setPeltPenalty(parseFloat(e.target.value))}
                            style={styles.slider}
                        />
                    </div>

                    <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>Hierarchical Distance Threshold</label>
                            <div
                                style={styles.tooltipContainer}
                                onMouseEnter={() => setActiveTooltip('distance')}
                                onMouseLeave={() => setActiveTooltip(null)}
                            >
                                <span style={styles.questionMark}>?</span>
                                <div style={{
                                    ...styles.tooltipText,
                                    opacity: activeTooltip === 'distance' ? 1 : 0,
                                    visibility: activeTooltip === 'distance' ? 'visible' : 'hidden',
                                    transform: activeTooltip === 'distance' ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(10px)'
                                }}>
                                    Controls adjacent-cluster merging in hierarchical trace flow.
                                    <br /><br />
                                    <strong>Lower threshold:</strong> stricter merging and more fine-grained hierarchy.
                                    <br />
                                    <strong>Higher threshold:</strong> more aggressive merging and broader clusters.
                                </div>
                            </div>
                            <span style={styles.valueDisplay}>{distanceThreshold.toFixed(2)}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={distanceThreshold}
                            onChange={(e) => setDistanceThreshold(parseFloat(e.target.value))}
                            style={styles.slider}
                        />
                    </div>

                    <div style={styles.controlGroup}>
                        <div style={styles.labelRow}>
                            <label style={styles.label}>Use AI for Micro-feature Naming & Description</label>
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

                <div style={styles.footer}>
                    <ModalButton variant="secondary" onClick={onClose} style={{ marginRight: '10px' }}>
                        Cancel
                    </ModalButton>
                    <ModalButton variant="primary" onClick={handleSubmit}>
                        Start Trace Decomposition
                    </ModalButton>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: THEME.overlay,
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000
    },
    modal: {
        width: '460px',
        maxWidth: 'calc(100vw - 32px)',
        backgroundColor: THEME.panelBg,
        border: `1px solid ${THEME.border}`,
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column'
    },
    header: {
        padding: '20px 24px',
        borderBottom: `1px solid ${THEME.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.02)'
    },
    title: {
        margin: 0,
        color: '#fff',
        fontSize: '16px',
        fontWeight: 600
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        color: THEME.textMuted,
        fontSize: '24px',
        cursor: 'pointer',
        padding: 0,
        lineHeight: 1
    },
    body: {
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
    },
    description: {
        margin: 0,
        fontSize: '13px',
        color: THEME.textMuted,
        lineHeight: '1.5'
    },
    controlGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    labelRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '4px'
    },
    label: {
        color: '#fff',
        fontSize: '13px',
        fontWeight: 500
    },
    valueDisplay: {
        marginLeft: 'auto',
        color: THEME.primary,
        fontWeight: 700,
        fontSize: '13px',
        fontFamily: 'monospace'
    },
    slider: {
        width: '100%',
        cursor: 'pointer',
        accentColor: THEME.primary
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
    tooltipContainer: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        cursor: 'help'
    },
    questionMark: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        backgroundColor: 'rgba(255,255,255,0.1)',
        color: '#aaa',
        fontSize: '11px',
        fontWeight: 'bold'
    },
    tooltipText: {
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%) translateY(10px)',
        marginBottom: '10px',
        width: '250px',
        backgroundColor: '#222',
        border: '1px solid #444',
        padding: '10px',
        borderRadius: '6px',
        fontSize: '12px',
        lineHeight: '1.4',
        color: '#ddd',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
        opacity: 0,
        visibility: 'hidden',
        transition: 'all 0.2s',
        zIndex: 3000
    },
    footer: {
        padding: '20px 24px',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.2)'
    }
};

export default TraceDecompositionModal;
