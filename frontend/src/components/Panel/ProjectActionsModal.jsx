import React from 'react';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const ProjectActionsModal = ({ project, onClose, onRerunSummarization, onAddTrace, onViewTraces, onExtractFeatures }) => {
    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.header}>
                    <h3 style={styles.title}>Project Actions: "{project?.name}"</h3>
                    <button onClick={onClose} style={styles.closeBtn}>x</button>
                </div>

                <div style={styles.body}>
                    <p style={styles.description}>
                        Manage analysis actions for this ready project.
                    </p>

                    <div style={styles.actionsGrid}>
                        <button style={styles.actionTile} onClick={onAddTrace}>
                            <div style={styles.tileTitle}>Add New Trace</div>
                            <div style={styles.tileDescription}>Upload an additional trace file for this project.</div>
                        </button>

                        <button style={styles.actionTile} onClick={onViewTraces}>
                            <div style={styles.tileTitle}>View All Traces</div>
                            <div style={styles.tileDescription}>Open the full trace list and inspect existing traces.</div>
                        </button>

                        <button style={styles.actionTile} onClick={onExtractFeatures}>
                            <div style={styles.tileTitle}>Extract Features</div>
                            <div style={styles.tileDescription}>Start functional decomposition with custom thresholds.</div>
                        </button>

                        <button style={styles.actionTile} onClick={onRerunSummarization}>
                            <div style={styles.tileTitle}>Run Summarization</div>
                            <div style={styles.tileDescription}>Generate AI summaries for the whole graph.</div>
                        </button>
                    </div>
                </div>

                <div style={styles.footer}>
                    <ModalButton variant="secondary" onClick={onClose}>Close</ModalButton>
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
        zIndex: 2100
    },
    modal: {
        width: '700px',
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
        margin: 0,
        fontSize: '13px',
        color: THEME.textMuted,
        lineHeight: '1.5'
    },
    actionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '12px'
    },
    actionTile: {
        textAlign: 'left',
        border: `1px solid ${THEME.border}`,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '10px',
        padding: '14px',
        cursor: 'pointer',
        color: THEME.textMain,
        transition: 'background-color 0.2s'
    },
    tileTitle: {
        fontSize: '14px',
        fontWeight: 700,
        marginBottom: '6px'
    },
    tileDescription: {
        fontSize: '12px',
        color: THEME.textMuted,
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

export default ProjectActionsModal;