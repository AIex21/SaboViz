import React, { useState } from 'react';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const CreateProjectOptionsModal = ({ projectName, onClose, onConfirm }) => {
    const [autoContinueUnresolved, setAutoContinueUnresolved] = useState(false);
    const [runSummarization, setRunSummarization] = useState(true);

    const handleConfirm = () => {
        onConfirm({ autoContinueUnresolved, runSummarization });
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.header}>
                    <h3 style={styles.title}>Create "{projectName}"</h3>
                    <button onClick={onClose} style={styles.closeBtn}>x</button>
                </div>

                <div style={styles.body}>
                    <p style={styles.description}>
                        Configure how ingestion should behave for this project.
                    </p>

                    <label style={styles.optionRow}>
                        <input
                            type="checkbox"
                            checked={autoContinueUnresolved}
                            onChange={(e) => setAutoContinueUnresolved(e.target.checked)}
                            style={styles.checkbox}
                        />
                        <div>
                            <div style={styles.optionTitle}>Auto-continue when includes are unresolved</div>
                            <div style={styles.optionHelp}>If unresolved includes are detected, continue ingestion automatically without asking.</div>
                        </div>
                    </label>

                    <label style={styles.optionRow}>
                        <input
                            type="checkbox"
                            checked={runSummarization}
                            onChange={(e) => setRunSummarization(e.target.checked)}
                            style={styles.checkbox}
                        />
                        <div>
                            <div style={styles.optionTitle}>Run AI summarization after ingestion</div>
                            <div style={styles.optionHelp}>Enable this to generate architecture summaries automatically.</div>
                        </div>
                    </label>
                </div>

                <div style={styles.footer}>
                    <ModalButton variant="secondary" onClick={onClose} style={{ marginRight: '10px' }}>
                        Cancel
                    </ModalButton>
                    <ModalButton variant="primary" onClick={handleConfirm}>
                        Create Project
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
        width: '560px',
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
        fontSize: '17px',
        fontWeight: 700
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
        gap: '16px'
    },
    description: {
        margin: '0 0 4px 0',
        fontSize: '13px',
        color: THEME.textMuted,
        lineHeight: '1.5'
    },
    optionRow: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${THEME.border}`,
        borderRadius: '10px',
        padding: '14px',
        cursor: 'pointer'
    },
    checkbox: {
        marginTop: '3px',
        width: '16px',
        height: '16px',
        accentColor: THEME.primary
    },
    optionTitle: {
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        marginBottom: '4px'
    },
    optionHelp: {
        color: THEME.textMuted,
        fontSize: '12px',
        lineHeight: '1.4'
    },
    footer: {
        padding: '20px 24px',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.2)'
    }
};

export default CreateProjectOptionsModal;