import React, { useEffect, useState } from 'react';
import { projectApi } from '../../api/project';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const PROCESSING_STATUSES = new Set(['processing', 'pending', 'decomposing', 'summarizing']);

const ProjectLogModal = ({ project, onClose }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadLogs = async (isBackground = false) => {
        if (!isBackground) {
            setLoading(true);
        }

        try {
            const data = await projectApi.getProjectLogs(project.id);
            setLogs(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Failed to load project logs.');
        } finally {
            if (!isBackground) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        let mounted = true;

        const load = async (isBackground = false) => {
            if (!isBackground) {
                setLoading(true);
            }

            try {
                const data = await projectApi.getProjectLogs(project.id);

                if (!mounted) return;

                setLogs(data);
                setError(null);
            } catch (err) {
                if (!mounted) return;

                console.error(err);
                setError('Failed to load project logs.');
            } finally {
                if (mounted && !isBackground) {
                    setLoading(false);
                }
            }
        };

        load();

        let intervalId;

        if (PROCESSING_STATUSES.has(project.status)) {
            intervalId = setInterval(() => load(true), 3000);
        }

        return () => {
            mounted = false;

            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [project.id, project.status]);

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <div style={styles.header}>
                    <div>
                        <h3 style={styles.title}>Activity Log</h3>
                        <p style={styles.subtitle}>{project.name}</p>
                    </div>

                    <button onClick={onClose} style={styles.closeBtn}>
                        ×
                    </button>
                </div>

                <div style={styles.body}>
                    {loading && (
                        <div style={styles.centerState}>
                            <div style={styles.spinner}></div>
                            <span>Loading logs...</span>
                        </div>
                    )}

                    {!loading && error && (
                        <div style={styles.centerState}>
                            <span style={{ color: THEME.danger }}>{error}</span>
                        </div>
                    )}

                    {!loading && !error && logs.length === 0 && (
                        <div style={styles.centerState}>
                            <span style={{ fontSize: '24px', marginBottom: '10px' }}>📭</span>
                            <span style={{ color: THEME.textMuted }}>No log entries yet.</span>
                        </div>
                    )}

                    {!loading && !error && logs.length > 0 && (
                        <div style={styles.timeline}>
                            {logs.map((log, index) => (
                                <div key={log.id} style={styles.logRow}>
                                    <div style={styles.timelineRail}>
                                        <div
                                            style={{
                                                ...styles.dot,
                                                backgroundColor: getStatusColor(log.status)
                                            }}
                                        />

                                        {index < logs.length - 1 && (
                                            <div style={styles.line} />
                                        )}
                                    </div>

                                    <div style={styles.logCard}>
                                        <div style={styles.logHeader}>
                                            <span
                                                style={{
                                                    ...styles.statusBadge,
                                                    color: getStatusColor(log.status),
                                                    border: `1px solid ${getStatusColor(log.status)}40`,
                                                    backgroundColor: `${getStatusColor(log.status)}18`
                                                }}
                                            >
                                                {formatStatus(log.status)}
                                            </span>

                                            <span style={styles.timeText}>
                                                {formatDate(log.created_at)}
                                            </span>
                                        </div>

                                        {log.description && (
                                            <p style={styles.description}>
                                                {log.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={styles.footer}>
                    <ModalButton variant="secondary" onClick={() => loadLogs(false)}>
                        Refresh
                    </ModalButton>

                    <ModalButton variant="primary" onClick={onClose}>
                        Close
                    </ModalButton>
                </div>
            </div>
        </div>
    );
};

const formatDate = (value) => {
    if (!value) return 'Unknown time';

    return new Date(value).toLocaleString();
};

const formatStatus = (status) => {
    switch (status) {
        case 'processing':
            return 'Processing';
        case 'decomposing':
            return 'Decomposing';
        case 'summarizing':
            return 'Summarizing';
        case 'error':
            return 'Error';
        case 'unresolved':
            return 'Action needed';
        case 'deleting':
            return 'Deleting';
        default:
            return 'Ready';
    }
};

const getStatusColor = (status) => {
    switch (status) {
        case 'processing':
            return THEME.warning;
        case 'decomposing':
            return THEME.accent;
        case 'summarizing':
            return THEME.summarizing;
        case 'error':
            return THEME.danger;
        case 'unresolved':
            return THEME.unresolved;
        case 'deleting':
            return THEME.danger;
        default:
            return THEME.success;
    }
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
        zIndex: 2200
    },

    modal: {
        width: '650px',
        maxWidth: '92vw',
        maxHeight: '82vh',
        backgroundColor: THEME.panelBg,
        border: `1px solid ${THEME.border}`,
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
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
        fontSize: '18px',
        fontWeight: 700
    },

    subtitle: {
        margin: '4px 0 0',
        color: THEME.textMuted,
        fontSize: '12px'
    },

    closeBtn: {
        background: 'none',
        border: 'none',
        color: THEME.textMuted,
        fontSize: '26px',
        cursor: 'pointer',
        padding: 0,
        lineHeight: 1
    },

    body: {
        padding: '20px 24px',
        overflowY: 'auto',
        minHeight: '260px'
    },

    centerState: {
        minHeight: '220px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: THEME.textMuted,
        gap: '10px'
    },

    spinner: {
        width: '22px',
        height: '22px',
        border: `3px solid ${THEME.border}`,
        borderTop: `3px solid ${THEME.accent}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    },

    timeline: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0'
    },

    logRow: {
        display: 'flex',
        alignItems: 'stretch',
        gap: '14px'
    },

    timelineRail: {
        width: '18px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    },

    dot: {
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        marginTop: '17px',
        flexShrink: 0,
        boxShadow: '0 0 10px rgba(255,255,255,0.15)'
    },

    line: {
        width: '1px',
        flex: 1,
        backgroundColor: THEME.border,
        marginTop: '4px'
    },

    logCard: {
        flex: 1,
        padding: '14px 16px',
        marginBottom: '12px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${THEME.border}`
    },

    logHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '8px'
    },

    statusBadge: {
        padding: '3px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.04em'
    },

    timeText: {
        color: THEME.textMuted,
        fontSize: '11px',
        whiteSpace: 'nowrap'
    },

    description: {
        margin: 0,
        color: THEME.textMain,
        fontSize: '13px',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere'
    },

    footer: {
        padding: '16px 24px',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        background: 'rgba(255,255,255,0.02)'
    }
};

export default ProjectLogModal;