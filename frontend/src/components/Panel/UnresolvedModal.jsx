import React, { useEffect, useState } from 'react';
import { projectApi } from '../../api/project';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const UnresolvedModal = ({ project, onClose, onProceed, onDelete }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        projectApi.getUnresolvedIncludes(project.id)
            .then(data => {
                setItems(data.unresolved || []);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError("Failed to load details.");
                setLoading(false);
            });
    }, [project.id]);

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                
                {/* --- HEADER --- */}
                <div style={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>⚠️</span>
                        <h3 style={styles.title}>Action Needed</h3>
                    </div>
                    <button onClick={onClose} style={styles.closeX}>×</button>
                </div>

                {/* --- CONTENT --- */}
                <div style={styles.contentWrapper}>
                    <p style={styles.description}>
                        The parser detected <strong style={{color: THEME.textMain}}>{items.length} unresolved libraries</strong> in "<em>{project.name}</em>".
                        <br />
                        This usually happens if external library paths are not configured correctly in the backend.
                    </p>

                    <div style={styles.listContainer}>
                        {loading && <div style={styles.loading}>Loading analysis data...</div>}
                        {error && <div style={{ color: THEME.danger, padding: '20px' }}>{error}</div>}

                        {!loading && !error && (
                            <div style={styles.list}>
                                {items.map((item, idx) => (
                                    <div key={idx} style={styles.listItem}>
                                        <div style={styles.itemHeader}>
                                            <span style={styles.itemBadge}>MISSING</span>
                                            {/* Clean up the path for display */}
                                            <span style={styles.itemName}>
                                                {item[0].replace(/cpp\+(system)?include:\/\/\//, '')}
                                            </span>
                                        </div>
                                        <div style={styles.itemLocation}>
                                            Found in: {item[1].split('|')[1]?.replace('file:///', '') || item[1]}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* --- FOOTER --- */}
                <div style={styles.footer}>
                    <ModalButton variant="danger" onClick={onDelete}>
                        Delete Project
                    </ModalButton>

                    <div style={{ flex: 1 }}></div>

                    <ModalButton variant="secondary" onClick={onClose}>
                        Cancel
                    </ModalButton>
                    
                    <ModalButton variant="primary" onClick={onProceed}>
                        Process Anyway →
                    </ModalButton>
                </div>
            </div>
        </div>
    );
};

// --- STYLES ---
const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: THEME.overlay,
        backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 1000
    },
    modal: {
        backgroundColor: THEME.panelBg,
        border: `1px solid ${THEME.border}`,
        borderRadius: '16px',
        width: '600px',
        maxWidth: '90%',
        maxHeight: '85vh',
        display: 'flex', 
        flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        color: THEME.textMain,
        overflow: 'hidden'
    },
    header: {
        padding: '20px 24px',
        borderBottom: `1px solid ${THEME.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.02)'
    },
    title: {
        margin: 0,
        color: THEME.unresolved, // Uses the yellow from theme
        fontSize: '18px',
        fontWeight: '700'
    },
    closeX: {
        background: 'none', border: 'none',
        fontSize: '28px', color: THEME.textMuted,
        cursor: 'pointer', lineHeight: 1, padding: 0
    },
    contentWrapper: {
        flex: 1,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden' // Allows internal list to scroll
    },
    description: {
        padding: '20px 24px 10px',
        margin: 0,
        fontSize: '14px',
        color: THEME.textMuted,
        lineHeight: '1.6'
    },
    listContainer: {
        flex: 1,
        overflowY: 'auto',
        padding: '10px 24px 20px',
    },
    list: {
        display: 'flex', flexDirection: 'column', gap: '8px'
    },
    listItem: {
        backgroundColor: THEME.bg,
        border: `1px solid ${THEME.border}`,
        borderRadius: '8px',
        padding: '12px 16px',
    },
    itemHeader: {
        display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px'
    },
    itemBadge: {
        fontSize: '10px', fontWeight: '800',
        backgroundColor: 'rgba(239, 68, 68, 0.15)', // Red tint
        color: THEME.danger,
        padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.5px'
    },
    itemName: {
        fontWeight: '600', fontSize: '14px', color: THEME.textMain,
        fontFamily: 'monospace'
    },
    itemLocation: {
        fontSize: '12px', color: THEME.textMuted,
        marginLeft: '2px', wordBreak: 'break-all'
    },
    loading: {
        textAlign: 'center', color: THEME.textMuted, padding: '20px'
    },
    footer: {
        padding: '20px 24px',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex', gap: '12px',
        backgroundColor: 'rgba(0,0,0,0.2)'
    }
};

export default UnresolvedModal;