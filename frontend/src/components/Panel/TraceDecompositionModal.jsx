import React, { useState } from 'react';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const TraceDecompositionModal = ({ project, onClose, onConfirm }) => {
    const [useAi, setUseAi] = useState(true);

    const handleSubmit = () => {
        onConfirm(project.id, useAi);
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
    footer: {
        padding: '20px 24px',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.2)'
    }
};

export default TraceDecompositionModal;
