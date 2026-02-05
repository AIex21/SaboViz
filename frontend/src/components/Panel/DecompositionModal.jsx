import React, { useState } from 'react';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const DecompositionModal = ({ project, onClose, onConfirm }) => {
    const [distanceThreshold, setDistanceThreshold] = useState(0.4);
    const [infrastructureThreshold, setInfrastructureThreshold] = useState(0.3);

    const [activeTooltip, setActiveTooltip] = useState(null);

    const handleSubmit = () => {
        onConfirm(project.id, distanceThreshold, infrastructureThreshold);
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
                        Configure the thresholds for the functional decomposition algorithm.
                    </p>

                    {/* Distance Threshold Control */}
                    <div style={styles.controlGroup}>
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
                    </div>

                    {/* Infrastructure Threshold Control */}
                    <div style={styles.controlGroup}>
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