import React, { useState } from 'react';
import { THEME, EDGE_COLORS, formatKey } from '../../config/graphConfig';

const SidebarPanel = ({ 
    isOpen, 
    setIsOpen, 
    edgeVisibility, 
    toggleEdge, 
    features = [], 
    onFeatureToggle,
    activeFeatureIds = new Set(),
    isDecomposing = false 
}) => {
    const [activeTab, setActiveTab] = useState('structural'); // 'structural' or 'functional'

    return (
        <div style={sidebarContainerStyle(isOpen)}>
            {/* PANEL HEADER */}
            <div style={headerStyle}>
                {isOpen && <span style={headerTitleStyle}>EXPLORER</span>}
                <button onClick={() => setIsOpen(!isOpen)} style={toggleButtonStyle}>
                    {isOpen ? '←' : '→'}
                </button>
            </div>

            {isOpen && (
                <div style={contentWrapperStyle}>
                    {/* NAVIGATION TABS */}
                    <div style={tabContainerStyle}>
                        <button 
                            onClick={() => setActiveTab('structural')}
                            style={tabStyle(activeTab === 'structural')}
                        >
                            STRUCTURAL
                        </button>
                        <button 
                            onClick={() => setActiveTab('functional')}
                            style={tabStyle(activeTab === 'functional')}
                        >
                            FUNCTIONAL
                        </button>
                    </div>

                    <div style={scrollAreaStyle}>
                        {/* --- SECTION 1: STRUCTURAL FILTERS --- */}
                        {activeTab === 'structural' && (
                            <div style={sectionStyle}>
                                <div style={subHeaderStyle}>RELATIONSHIP TYPES</div>
                                {Object.keys(edgeVisibility).map(type => (
                                    <div 
                                        key={type} 
                                        onClick={() => toggleEdge(type)} 
                                        style={rowStyle(edgeVisibility[type])}
                                    >
                                        <div style={labelGroupStyle}>
                                            <span style={dotStyle(EDGE_COLORS[type], edgeVisibility[type])}></span>
                                            <span style={textStyle}>{formatKey(type)}</span>
                                        </div>
                                        <span style={statusTextStyle(edgeVisibility[type])}>
                                            {edgeVisibility[type] ? 'VISIBLE' : 'HIDDEN'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* --- SECTION 2: FUNCTIONAL FEATURES (RO2) --- */}
                        {activeTab === 'functional' && (
                            <div style={sectionStyle}>
                                <div style={subHeaderStyle}>RECOVERED FEATURES</div>
                                
                                {isDecomposing && (
                                    <div style={loadingStateStyle}>
                                        <div style={spinnerStyle}></div>
                                        <span>Analyzing runtime patterns...</span>
                                    </div>
                                )}

                                {!isDecomposing && features.length === 0 && (
                                    <div style={emptyStateStyle}>
                                        No features recovered. Run decomposition to identify functional units.
                                    </div>
                                )}

                                {features.map(feature => (
                                    <div 
                                        key={feature.id} 
                                        onClick={() => onFeatureToggle(feature.id)}
                                        style={rowStyle(activeFeatureIds.has(feature.id))}
                                    >
                                        <div style={labelGroupStyle}>
                                            <span style={featureIconStyle(feature.category)}>
                                                {feature.category === 'Infrastructure' ? '⚙️' : '🧩'}
                                            </span>
                                            <div style={featureTextGroup}>
                                                <span style={textStyle}>{feature.name}</span>
                                                <span style={scoreStyle}>Score: {feature.score.toFixed(2)}</span>
                                            </div>
                                        </div>
                                        <div style={checkboxStyle(activeFeatureIds.has(feature.id))}>
                                            {activeFeatureIds.has(feature.id) && '✓'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES (Matched to Project Theme) ---
const sidebarContainerStyle = (isOpen) => ({
    width: isOpen ? '280px' : '50px',
    position: 'absolute', top: '20px', left: '20px', bottom: '20px',
    backgroundColor: 'rgba(30, 30, 30, 0.9)', backdropFilter: 'blur(16px)',
    border: `1px solid ${THEME.border}`, borderRadius: '16px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 100,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 12px 40px rgba(0,0,0,0.4)'
});

const headerStyle = {
    height: '60px', padding: '0 16px', display: 'flex', 
    alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.05)'
};

const tabContainerStyle = {
    display: 'flex', padding: '12px', gap: '8px', 
    borderBottom: '1px solid rgba(255,255,255,0.05)'
};

const tabStyle = (isActive) => ({
    flex: 1, padding: '8px 0', fontSize: '10px', fontWeight: '800',
    backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
    color: isActive ? THEME.primary : '#666', border: 'none',
    borderRadius: '6px', cursor: 'pointer', letterSpacing: '1px',
    transition: 'all 0.2s'
});

const sectionStyle = { padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' };
const subHeaderStyle = { fontSize: '10px', fontWeight: '800', color: '#555', marginBottom: '10px', letterSpacing: '1px' };

const rowStyle = (isActive) => ({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
    backgroundColor: isActive ? 'rgba(255,255,255,0.03)' : 'transparent',
    transition: 'all 0.2s', border: '1px solid transparent',
    borderColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent'
});

const textStyle = { color: '#eee', fontSize: '13px', fontWeight: '500' };
const scoreStyle = { fontSize: '10px', color: '#666', fontFamily: 'monospace' };

const dotStyle = (color, isVisible) => ({
    width: '8px', height: '8px', borderRadius: '50%',
    backgroundColor: color, 
    boxShadow: isVisible ? `0 0 8px ${color}` : 'none',
    opacity: isVisible ? 1 : 0.3
});

const featureIconStyle = (category) => ({
    fontSize: '14px', opacity: category === 'Infrastructure' ? 0.5 : 1
});

const checkboxStyle = (isActive) => ({
    width: '16px', height: '16px', borderRadius: '4px',
    border: `1px solid ${isActive ? THEME.primary : '#444'}`,
    backgroundColor: isActive ? THEME.primary : 'transparent',
    color: '#fff', fontSize: '10px', display: 'flex', 
    alignItems: 'center', justifyContent: 'center'
});

const headerTitleStyle = { 
    fontWeight: 700, 
    fontSize: '12px', 
    letterSpacing: '1px', 
    color: '#888' 
};

const toggleButtonStyle = {
    background: 'transparent', 
    border: 'none', 
    color: '#fff', 
    cursor: 'pointer', 
    fontSize: '18px',
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    width: '24px', 
    height: '24px'
};

const contentWrapperStyle = { 
    display: 'flex', 
    flexDirection: 'column', 
    flex: 1, 
    overflow: 'hidden' 
};

const scrollAreaStyle = { 
    flex: 1, 
    overflowY: 'auto', 
    paddingBottom: '20px' 
};

const labelGroupStyle = { 
    display: 'flex', 
    alignItems: 'center', 
    gap: '12px' 
};

const statusTextStyle = (isVisible) => ({
    fontSize: '10px', 
    color: isVisible ? '#666' : '#444', 
    fontFamily: 'monospace'
});

const featureTextGroup = { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '2px' 
};

const loadingStateStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '40px 20px',
    color: '#666',
    fontSize: '12px',
    textAlign: 'center'
};

const emptyStateStyle = {
    padding: '40px 20px',
    color: '#555',
    fontSize: '12px',
    textAlign: 'center',
    lineHeight: '1.6',
    fontStyle: 'italic'
};

const spinnerStyle = {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.1)',
    borderTop: `2px solid ${THEME.primary}`,
    animation: 'spin 1s linear infinite'
};

// Add the keyframe animation if not present in your global CSS
if (typeof document !== 'undefined' && !document.getElementById('sidebar-animations')) {
    const styleSheet = document.createElement("style");
    styleSheet.id = 'sidebar-animations';
    styleSheet.innerText = `
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(styleSheet);
}

export default SidebarPanel;