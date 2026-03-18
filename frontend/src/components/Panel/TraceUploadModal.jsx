import React, { useState } from 'react';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';
import { useToast } from '../../context/ToastContext';

const TraceUploadModal = ({ project, onClose, onUpload }) => {
    const { showToast } = useToast();
    const [files, setFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!files.length) {
            showToast("Please select at least one file first", "warning");
            return;
        }

        setIsLoading(true);
        try {
            await onUpload(project.id, files);
            onClose();
        } catch (error) {
            console.error(error);
            setIsLoading(false);
        }
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={styles.header}>
                    <h3 style={styles.title}>Add Trace to "{project.name}"</h3>
                    <button onClick={onClose} style={styles.closeBtn}>×</button>
                </div>

                {/* Body */}
                <div style={styles.body}>
                    <p style={styles.description}>
                        Upload one or more <strong>.log</strong> files containing execution traces to analyze the runtime behavior of this system.
                    </p>

                    <div style={styles.dropZone}>
                        <label style={styles.fileLabel}>
                            <span style={{fontSize: '24px', marginBottom: '8px'}}>📄</span>
                            <span>
                                {files.length
                                    ? `${files.length} file${files.length === 1 ? '' : 's'} selected`
                                    : "Click to select one or more trace files"}
                            </span>
                            {files.length > 0 && (
                                <span style={styles.fileNamesPreview}>
                                    {files.slice(0, 3).map((file) => file.name).join(', ')}
                                    {files.length > 3 ? ` (+${files.length - 3} more)` : ''}
                                </span>
                            )}
                            <input 
                                type="file" 
                                accept=".log,.txt,.json"
                                multiple
                                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                                style={{display: 'none'}}
                            />
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <ModalButton variant="secondary" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </ModalButton>
                    <ModalButton 
                        variant="primary" 
                        onClick={handleSubmit} 
                        disabled={!files.length || isLoading}
                    >
                        {isLoading ? 'Uploading...' : 'Upload Trace(s)'}
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
        overflow: 'hidden',
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
    body: { padding: '24px' },
    description: { margin: '0 0 20px 0', color: THEME.textMuted, fontSize: '14px', lineHeight: '1.5' },
    dropZone: {
        border: `2px dashed ${THEME.border}`,
        borderRadius: '12px',
        backgroundColor: THEME.bg,
        transition: 'border-color 0.2s',
        cursor: 'pointer',
        ':hover': { borderColor: THEME.primary }
    },
    fileLabel: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '30px', cursor: 'pointer', color: THEME.textMain, fontSize: '14px', fontWeight: 500
    },
    fileNamesPreview: {
        marginTop: '8px',
        color: THEME.textMuted,
        fontSize: '12px',
        textAlign: 'center'
    },
    footer: {
        padding: '20px 24px',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex', justifyContent: 'flex-end', gap: '12px',
        backgroundColor: 'rgba(0,0,0,0.2)'
    }
};

export default TraceUploadModal;