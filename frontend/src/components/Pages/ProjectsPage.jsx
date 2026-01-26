import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectApi } from '../../api/project';
import { THEME } from '../../config/graphConfig';
import ConfirmationModal from '../Panel/ConfirmationModal';
import UnresolvedModal from '../Panel/UnresolvedModal';
import TraceUploadModal from '../Panel/TraceUploadModal';
import TraceListModal from '../Panel/TraceListModal';
import { useToast } from '../../context/ToastContext';

const ProjectsPage = () => {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [file, setFile] = useState(null);
    const [projectName, setProjectName] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState(null);
    const [selectedUnresolved, setSelectedUnresolved] = useState(null);
    const [selectedProjectForTrace, setSelectedProjectForTrace] = useState(null);
    const [viewTracesProject, setViewTracesProject] = useState(null);

    useEffect(() => { 
        loadProjects(); 
    }, []);

    useEffect(() => {
        const hasProcessing = projects.some(p => p.status === 'processing' || p.status === 'pending');
        
        let intervalId;
        if (hasProcessing) {
            intervalId = setInterval(() => {
                loadProjects(true);
            }, 3000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [projects]);

    const loadProjects = async (isBackground = false) => {
        try {
            const data = await projectApi.getProjects();
            setProjects(data);
        } catch (err) { 
            if (!isBackground) console.error(err);
        }
    };

    const handleRequestDelete = (e, project) => {
        e?.stopPropagation();
        setProjectToDelete(project);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!projectToDelete) return;

        setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
        setProjectToDelete(null);
        setIsDeleteModalOpen(false);

        if (selectedUnresolved?.id === projectToDelete.id) {
            setSelectedUnresolved(null);
        }

        showToast("Project deletion initiated.", "info");

        try {
            await projectApi.deleteProject(projectToDelete.id);
        } catch (error) {
            showToast("Failed to delete project on server", "error")
            loadProjects();
        }
    }

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file || !projectName) {
            showToast("Please select a file and enter a name", "error");
            return;
        }
        setIsUploading(true);
        try {
            const newProject = await projectApi.uploadProject(file, projectName);
            setProjects(prevProjects => [newProject, ...prevProjects]);
            setProjectName("");
            setFile(null);
            showToast("Project created! Processing started...", "success");
            loadProjects();
        } catch (error) {
            const msg = error.response?.data?.detail || error.message;
            showToast(`Upload failed: ${msg}`, "error");
        } finally { 
            setIsUploading(false); 
        }
    };

    const handleOpenUnresolved = (e, project) => {
        e.stopPropagation();
        setSelectedUnresolved(project);
    }

    const handleProceed = async () => {
        if (!selectedUnresolved) return;
        const targetId = selectedUnresolved.id;
        try {
            await projectApi.continueIngestion(selectedUnresolved.id);
            showToast("Ingestion resumed...", "success");
            setSelectedUnresolved(null);
            setProjects(prev => prev.map(p => 
                p.id === targetId ? { ...p, status: 'processing' } : p
            ));
        } catch (err) {
            showToast("Failed to resume ingestion", "error");
        }
    }

    const handleDeleteFromModal = () => {
        if (!selectedUnresolved) return;
        const project = selectedUnresolved;
        setSelectedUnresolved(null);
        handleRequestDelete(null, project);
    }

    const handleOpenTraceModal = (e, project) => {
        e.stopPropagation();
        setSelectedProjectForTrace(project);
    }

    const handleUploadTrace = async (projectId, file) => {
        try {
            await projectApi.uploadTrace(projectId, file);
            showToast("Trace uploaded successfully!", "success");
            setSelectedProjectForTrace(null);
        } catch (error) {
            const msg = error.response?.data?.detail || error.message;
            showToast(`Trace upload failed: ${msg}`, "error");
            throw error;
        }
    }

    const handleViewTraces = (e, project) => {
        e.stopPropagation();
        setViewTracesProject(project);
    }

    return (
        <div style={styles.pageWrapper}>
            <div style={styles.container}>
                
                {/* --- HEADER --- */}
                <div style={styles.header}>
                    <div>
                        <h1 style={styles.title}>SaboViz</h1>
                        <p style={styles.subtitle}>Visualization & Trace Analysis Dashboard</p>
                    </div>
                    <div style={styles.statsBadge}>
                        {projects.length} Active {projects.length === 1 ? 'Project' : 'Projects'}
                    </div>
                </div>

                {/* --- ACTION BAR (Upload) --- */}
                <div style={styles.uploadCard}>
                    <form onSubmit={handleUpload} style={styles.form}>
                        <div style={styles.inputGroup}>
                            <label style={styles.label}>PROJECT NAME</label>
                            <input 
                                type="text" 
                                placeholder="Project Name" 
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                style={styles.input}
                                required
                            />
                        </div>
                        
                        <div style={{...styles.inputGroup, flex: 1.5}}>
                            <label style={styles.label}>SOURCE FILE .zip or LPG/M3 model</label>
                            <div style={styles.fileInputWrapper}>
                                <label style={styles.customFileButton}>
                                    {file ? 'Change File' : 'Browse Files'}
                                    <input 
                                        type="file" 
                                        onChange={(e) => setFile(e.target.files[0])}
                                        style={{display: 'none'}}
                                        required
                                    />
                                </label>
                                <span style={styles.fileName}>
                                    {file ? file.name : "No file selected"}
                                </span>
                            </div>
                        </div>

                        <div style={styles.actionGroup}>
                             <button type="submit" disabled={isUploading} style={styles.primaryBtn}>
                                {isUploading ? 'IMPORTING...' : 'CREATE PROJECT'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* --- PROJECTS GRID --- */}
                <div style={styles.grid}>
                    {projects.map(p => (
                        <div 
                            key={p.id} 
                            style={{
                                ...styles.card, 
                                opacity: p.status === 'processing' ? 0.6 : 1,
                                pointerEvents: p.status === 'processing' ? 'none' : 'auto'
                            }} onClick={() => p.status === 'ready' && navigate(`/project/${p.id}`)}>
                            <div style={styles.cardHeader}>
                                <div style={{
                                    ...styles.iconPlaceholder,
                                    background: getStatusGradient(p.status)
                                }}>
                                    {p.name.slice(0, 2).toUpperCase()}
                                </div>
                                <button 
                                    onClick={(e) => (p.status === 'ready' || p.status === 'error') && handleRequestDelete(e, p)} 
                                    style={styles.deleteBtn}
                                    title="Delete Project"
                                >
                                    ×
                                </button>
                            </div>
                            
                            <div style={styles.cardBody}>
                                <h2 style={styles.cardTitle}>{p.name}</h2>

                                <div style={{marginTop: '8px', display:'flex', alignItems:'center', gap: '10px'}}>
                                    <span style={{
                                        ...styles.statusBadge,
                                        backgroundColor: getStatusColor(p.status) + '20',
                                        color: getStatusColor(p.status),
                                        border: `1px solid ${getStatusColor(p.status)}40`,
                                        padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700'
                                    }}>
                                        {p.status === 'processing' ? '⚡ PROCESSING...' : 
                                        p.status === 'error' ? '⚠ FAILED' : 
                                        p.status === 'unresolved' ? '⚠ ACTION NEEDED' :
                                        '● READY'}
                                    </span>
                                </div>

                                {p.status === 'unresolved' && (
                                    <button
                                        onClick={(e) => handleOpenUnresolved(e, p)}
                                        style={styles.actionNeededBtn}
                                    >
                                        View Details
                                    </button>
                                )}

                                {p.description && (
                                    <p style={{fontSize: '11px', color: '#667', marginTop: '10px', lineHeight: '1.4'}}>
                                        {p.description.length > 50 ? p.description.substring(0,50) + '...' : p.description}
                                    </p>
                                )}
                            </div>

                            <div style={styles.cardFooter}>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                                    {p.status === 'ready' ? (
                                        <span style={styles.openLink}>Open Workspace →</span>
                                    ): p.status === 'unresolved' ? (
                                        <span style={{fontSize: '12px', color: '#eab308'}}>Action Required</span>
                                    ) : (
                                        <span style={{fontSize: '12px', color: '#667'}}>Please wait...</span>
                                    )}

                                    {p.status === 'ready' && (
                                        <div style={{display: 'flex', gap: '8px'}}>
                                            {/* VIEW TRACES BUTTON */}
                                            <button 
                                                onClick={(e) => handleViewTraces(e, p)}
                                                style={styles.iconBtn}
                                                title="View All Traces"
                                            >
                                                <span style={{fontSize: '14px'}}>📋</span>
                                            </button>

                                            {/* UPLOAD TRACE BUTTON */}
                                            <button 
                                                onClick={(e) => handleOpenTraceModal(e, p)}
                                                style={styles.iconBtn}
                                                title="Add New Trace"
                                            >
                                                <span style={{fontSize: '14px'}}>📄</span> +
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {projects.length === 0 && (
                        <div style={styles.emptyState}>
                            <h3 style={{color: THEME.textMuted, marginTop: 0}}>No projects found</h3>
                            <p style={{fontSize: '14px', color: '#666'}}>Create a new project above to begin visualizing.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* --- CONFIRMATION MODAL --- */}
            <ConfirmationModal 
                isOpen={isDeleteModalOpen}
                title="Delete Project?"
                message={`Are you sure you want to delete the project "${projectToDelete?.name}"? This action cannot be undone.`}
                onConfirm={handleConfirmDelete}
                onCancel={() => setIsDeleteModalOpen(false)}
            />

            {selectedUnresolved && (
                <UnresolvedModal
                    project={selectedUnresolved}
                    onClose={() => setSelectedUnresolved(null)}
                    onProceed={handleProceed}
                    onDelete={handleDeleteFromModal}    
                />
            )}

            {selectedProjectForTrace && (
                <TraceUploadModal
                    project={selectedProjectForTrace}
                    onClose={() => setSelectedProjectForTrace(null)}
                    onUpload={handleUploadTrace}
                />
            )}

            {viewTracesProject && (
                <TraceListModal
                    project={viewTracesProject}
                    onClose={() => setViewTracesProject(null)}
                />
            )}
        </div>
    );
};

const getStatusColor = (status) => {
    switch(status) {
        case 'processing': return THEME.warning; // Orange
        case 'error': return THEME.danger;       // Red
        case 'unresolved': return THEME.unresolved;
        default: return THEME.success;           // Green
    }
};

const getStatusGradient = (status) => {
    switch(status) {
        case 'processing': return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        case 'error': return 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
        case 'unresolved': return 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)';
        default: return 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
    }
};

// --- STYLES ---
const styles = {
    pageWrapper: {
        minHeight: '100vh',
        width: '100%',
        backgroundColor: THEME.bg,
        color: THEME.textMain,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: '60px 40px',
        boxSizing: 'border-box' // Ensures padding doesn't overflow width
    },
    container: {
        width: '100%',
        maxWidth: '1400px', // Increased width for better screen usage
        margin: '0 auto',   // THIS CENTERS IT
        display: 'flex',
        flexDirection: 'column',
        gap: '40px'
    },
    
    // Header
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingBottom: '20px',
        borderBottom: `1px solid ${THEME.border}`
    },
    title: {
        fontSize: '42px', // Larger title
        fontWeight: '800',
        margin: 0,
        letterSpacing: '-1px',
        background: `linear-gradient(to right, #fff, ${THEME.textMuted})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        display: 'inline-block'
    },
    subtitle: {
        margin: '8px 0 0 0',
        color: THEME.textMuted,
        fontSize: '15px',
        fontWeight: 400
    },
    statsBadge: {
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${THEME.border}`,
        padding: '8px 16px',
        borderRadius: '30px',
        fontSize: '13px',
        fontWeight: '600',
        color: THEME.textMuted
    },

    // Upload Section
    uploadCard: {
        backgroundColor: THEME.panelBg,
        border: `1px solid ${THEME.border}`,
        borderRadius: '16px',
        padding: '30px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
    },
    form: {
        display: 'flex',
        gap: '30px',
        alignItems: 'flex-end',
        flexWrap: 'wrap'
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        flex: 1,
        minWidth: '220px'
    },
    actionGroup: {
        paddingBottom: '2px'
    },
    label: {
        fontSize: '11px',
        fontWeight: '700',
        color: '#888',
        letterSpacing: '0.5px'
    },
    input: {
        background: THEME.bg,
        border: `1px solid ${THEME.border}`,
        color: '#fff',
        padding: '14px',
        borderRadius: '8px',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s',
        width: '100%',
        boxSizing: 'border-box'
    },
    fileInputWrapper: {
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        background: THEME.bg,
        border: `1px solid ${THEME.border}`,
        padding: '8px',
        borderRadius: '8px',
        height: '46px',
        boxSizing: 'border-box'
    },
    customFileButton: {
        background: '#333',
        color: '#eee',
        padding: '6px 14px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background 0.2s',
        ':hover': { background: '#444' }
    },
    fileName: {
        fontSize: '14px',
        color: THEME.textMuted,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '250px'
    },
    primaryBtn: {
        background: THEME.primary,
        color: '#fff',
        border: 'none',
        padding: '0 32px',
        borderRadius: '8px',
        fontWeight: '700',
        fontSize: '13px',
        cursor: 'pointer',
        letterSpacing: '0.5px',
        boxShadow: `0 4px 15px ${THEME.primary}40`,
        height: '46px',
        transition: 'transform 0.1s',
        ':active': { transform: 'translateY(1px)' }
    },

    // Grid
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', // Wider cards
        gap: '30px'
    },
    card: {
        backgroundColor: THEME.panelBg,
        border: `1px solid ${THEME.border}`,
        borderRadius: '16px',
        padding: '28px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        height: '220px',
        position: 'relative',
        overflow: 'hidden'
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '20px'
    },
    iconPlaceholder: {
        width: '56px',
        height: '56px',
        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '800',
        color: '#fff',
        fontSize: '20px',
        boxShadow: '0 8px 15px rgba(59, 130, 246, 0.25)'
    },
    deleteBtn: {
        background: 'transparent',
        border: 'none',
        color: '#444',
        fontSize: '28px',
        lineHeight: '0.5',
        cursor: 'pointer',
        padding: '0',
        transition: 'color 0.2s',
        ':hover': { color: THEME.danger }
    },
    cardBody: {
        flex: 1
    },
    cardTitle: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#fff',
        margin: '0 0 8px 0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    cardMeta: {
        fontSize: '13px',
        color: '#666',
        margin: 0,
        fontFamily: "'Fira Code', monospace"
    },
    cardFooter: {
        borderTop: '1px solid #333',
        paddingTop: '18px',
        marginTop: 'auto'
    },
    openLink: {
        fontSize: '13px',
        fontWeight: '600',
        color: THEME.primary,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    },
    emptyState: {
        gridColumn: '1 / -1',
        padding: '80px',
        border: `2px dashed ${THEME.border}`,
        borderRadius: '16px',
        textAlign: 'center',
        opacity: 0.6,
        background: 'rgba(255,255,255,0.02)'
    },
    actionNeededBtn: {
        backgroundColor: '#eab308',
        color: '#000',
        border: 'none',
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '700',
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(234, 179, 8, 0.3)',
        transition: 'transform 0.1s',
        ':active': { transform: 'scale(0.95)' }
    },
    iconBtn: {
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${THEME.border}`,
        color: THEME.textMain,
        borderRadius: '6px',
        padding: '4px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        transition: 'all 0.2s',
        ':hover': { background: 'rgba(255,255,255,0.1)' }
    }
};

export default ProjectsPage;