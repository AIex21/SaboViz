import React, { useEffect, useState } from 'react';
import { projectApi } from '../../api/project';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../../context/ToastContext';

const TraceListModal = ({ project, onClose }) => {
    const { showToast } = useToast();
    const [traces, setTraces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [traceToDelete, setTraceToDelete] = useState(null);

    useEffect(() => {
        let mounted = true;
        setLoading(true);

        projectApi.getTraces(project.id)
            .then(data => {
                if (mounted) {
                    setTraces(data);
                    setLoading(false);
                }
            })
            .catch(err => {
                if (mounted) {
                    console.error(err);
                    showToast("Failed to load traces from server.", "error");
                    setError("Failed to load traces.");
                    setLoading(false);
                }
            });

        return () => { mounted = false; };
    }, [project.id]);

    const handleRequestDelete = (trace) => {
        setTraceToDelete(trace);
        setIsDeleteModalOpen(true);
    }

    const handleConfirmDelete = async () => {
        if (!traceToDelete) return;

        try {
            await projectApi.deleteTrace(traceToDelete.id);
            setTraces(prev => prev.filter(t => t.id !== traceToDelete.id));

            setIsDeleteModalOpen(false);
            setTraceToDelete(null);
            showToast("Trace deleted successfully", "success");
        } catch (error) {
            console.error("Failed to delete trace:", error);
            const msg = error.response?.data?.detail || "Failed to delete trace";
            showToast(msg, "error");
        }
    }

    const getTotalSteps = (trace) => {
        if (typeof trace.total_steps === 'number') {
            return trace.total_steps;
        }
        return (
            (trace.resolved_steps || 0) +
            (trace.ambiguous_steps || 0) +
            (trace.unmapped_steps || 0)
        );
    }

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={styles.header}>
                    <h3 style={styles.title}>Traces for "{project.name}"</h3>
                    <button onClick={onClose} style={styles.closeBtn}>×</button>
                </div>

                {/* Body */}
                <div style={styles.body}>
                    {loading && (
                        <div style={styles.centerState}>
                            <div style={styles.spinner}></div>
                            <span>Loading...</span>
                        </div>
                    )}

                    {error && (
                        <div style={styles.centerState}>
                            <span style={{color: THEME.danger}}>{error}</span>
                        </div>
                    )}

                    {!loading && !error && traces.length === 0 && (
                        <div style={styles.centerState}>
                            <span style={{fontSize: '24px', marginBottom: '10px'}}>📭</span>
                            <span style={{color: THEME.textMuted}}>No traces uploaded yet.</span>
                        </div>
                    )}

                    {!loading && !error && traces.length > 0 && (
                        <div style={styles.list}>
                            {traces.map(trace => (
                                <div key={trace.id} style={styles.item}>
                                    <div style={styles.itemIcon}>📄</div>
                                    <div style={styles.itemContent}>
                                        <div style={styles.itemName}>{trace.name}</div>
                                        <div style={styles.itemMeta}>
                                            <span>{new Date(trace.created_at).toLocaleString()}</span>
                                        </div>
                                        <div style={styles.metricsRow}>
                                            <span style={styles.metricChipNeutral}>Steps {getTotalSteps(trace)}</span>
                                            <span style={styles.metricChipSuccess}>Resolved {trace.resolved_steps || 0}</span>
                                            <span style={styles.metricChipWarn}>Ambiguous {trace.ambiguous_steps || 0}</span>
                                            <span style={styles.metricChipDanger}>Unmapped {trace.unmapped_steps || 0}</span>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRequestDelete(trace);
                                        }}
                                        style={styles.deleteBtn}
                                        title="Delete Trace"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <ModalButton variant="primary" onClick={onClose}>
                        Close
                    </ModalButton>
                </div>
            </div>
            <ConfirmationModal 
                isOpen={isDeleteModalOpen}
                title="Delete Trace?"
                message={`Are you sure you want to delete the trace "${traceToDelete?.name}"? This cannot be undone.`}
                confirmLabel="Delete Trace"
                onConfirm={handleConfirmDelete}
                onCancel={() => setIsDeleteModalOpen(false)}
            />
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
        width: '500px',
        maxHeight: '80vh',
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
        padding: '0',
        flex: 1,
        overflowY: 'auto',
        minHeight: '200px'
    },
    list: {
        display: 'flex', flexDirection: 'column'
    },
    item: {
        display: 'flex', alignItems: 'center', gap: '15px',
        padding: '16px 24px',
        borderBottom: `1px solid rgba(255,255,255,0.05)`,
        transition: 'background 0.2s',
        ':last-child': { borderBottom: 'none' },
        position: 'relative'
    },
    itemIcon: {
        fontSize: '20px', opacity: 0.7
    },
    itemContent: {
        flex: 1, overflow: 'hidden'
    },
    itemName: {
        color: '#fff', fontSize: '14px', fontWeight: 500, marginBottom: '4px'
    },
    itemMeta: {
        color: THEME.textMuted, fontSize: '12px', display: 'flex', alignItems: 'center'
    },
    metricsRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        marginTop: '8px'
    },
    metricChipNeutral: {
        fontSize: '11px',
        color: THEME.textMain,
        border: `1px solid ${THEME.border}`,
        padding: '2px 7px',
        borderRadius: '999px',
        background: 'rgba(255,255,255,0.03)'
    },
    metricChipSuccess: {
        fontSize: '11px',
        color: '#16a34a',
        border: '1px solid rgba(22, 163, 74, 0.5)',
        padding: '2px 7px',
        borderRadius: '999px',
        background: 'rgba(22, 163, 74, 0.12)'
    },
    metricChipWarn: {
        fontSize: '11px',
        color: '#d97706',
        border: '1px solid rgba(217, 119, 6, 0.5)',
        padding: '2px 7px',
        borderRadius: '999px',
        background: 'rgba(217, 119, 6, 0.14)'
    },
    metricChipDanger: {
        fontSize: '11px',
        color: '#dc2626',
        border: '1px solid rgba(220, 38, 38, 0.5)',
        padding: '2px 7px',
        borderRadius: '999px',
        background: 'rgba(220, 38, 38, 0.14)'
    },
    deleteBtn: {
        background: 'transparent',
        border: 'none',
        color: '#666',
        fontSize: '16px',
        cursor: 'pointer',
        padding: '8px',
        borderRadius: '4px',
        transition: 'all 0.2s',
        ':hover': { 
            color: THEME.danger,
            background: 'rgba(239, 68, 68, 0.1)'
        }
    },
    centerState: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '200px', color: THEME.textMain
    },
    spinner: {
        width: '24px', height: '24px', borderRadius: '50%',
        border: `2px solid rgba(255,255,255,0.1)`, borderTop: `2px solid ${THEME.primary}`,
        animation: 'spin 1s linear infinite', marginBottom: '10px'
    },
    footer: {
        padding: '20px 24px',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex', justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.2)'
    }
};

export default TraceListModal;