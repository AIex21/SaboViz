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
            <div style={headerStyle(isOpen)}>
                {isOpen && (
                    <div style={{display:'flex', flexDirection:'column'}}>
                        <span style={headerTitleStyle}>FILTERS</span>
                        <span style={headerSubtitleStyle}>Graph Analysis</span>
                    </div>
                )}
                <button onClick={() => setIsOpen(!isOpen)} style={toggleButtonStyle}>
                    {isOpen ? '✕' : '☰'}
                </button>
            </div>

            {!isOpen && (
                <div style={verticalTextContainerStyle}>
                    <span style={verticalTextStyle}>FILTERS</span>
                </div>
            )}

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
                                        <div style={structuralLabelGroupStyle}>
                                            <div style={iconCenterWrapperStyle}>
                                                <span style={dotStyle(EDGE_COLORS[type], edgeVisibility[type])}></span>
                                            </div>
                                            <span style={textStyle(edgeVisibility[type])}>{formatKey(type)}</span>
                                        </div>
                                        
                                        {/* Styled Toggle Switch appearance */}
                                        <div style={visibilityToggleStyle(edgeVisibility[type])}>
                                            {edgeVisibility[type] ? 'ON' : 'OFF'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* --- SECTION 2: FUNCTIONAL FEATURES --- */}
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
                                        No features recovered yet.<br/>Run decomposition to identify functional units.
                                    </div>
                                )}

                                {features.map(feature => {
                                    const isActive = activeFeatureIds.has(feature.id);
                                    return (
                                        <div 
                                            key={feature.id} 
                                            onClick={() => onFeatureToggle(feature.id)}
                                            style={featureCardStyle(isActive)}
                                        >
                                            {/* TOP ROW: Icon, Text, and Checkbox */}
                                            <div style={featureCardTopRowStyle}>
                                                <div style={featureLabelGroupStyle}>
                                                    <div style={iconTopWrapperStyle}>
                                                        <span style={featureIconStyle(feature.category)}>
                                                            {feature.category === 'Infrastructure' ? '⚙️' : '🧩'}
                                                        </span>
                                                    </div>
                                                    
                                                    <div style={featureTextGroup}>
                                                        <span style={featureTitleStyle(isActive)}>{feature.name}</span>
                                                        <div style={metaRowStyle}>
                                                            <span style={scoreBadgeStyle}>
                                                                Score: {feature.score.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* CHECKBOX */}
                                                <div style={circleCheckboxStyle(isActive)}>
                                                    {isActive && <span style={checkIconStyle}>✓</span>}
                                                </div>
                                            </div>

                                            {/* BOTTOM ROW: Full-width Description Box */}
                                            {feature.description && (
                                                <div style={descriptionContainerStyle}>
                                                    <span style={{ fontSize: '12px', marginTop: '1px' }}>✨</span>
                                                    <span style={descriptionStyle}>
                                                        {feature.description}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STATES & CONTAINER ---

const sidebarContainerStyle = (isOpen) => ({
    width: isOpen ? '300px' : '60px', 
    position: 'absolute', top: '20px', left: '20px', bottom: '20px',
    // #121212 converted to rgba so the blur effect still works!
    backgroundColor: 'rgba(18, 18, 18, 0.95)', 
    backdropFilter: 'blur(20px)',
    border: `1px solid rgba(255,255,255,0.08)`, 
    borderRadius: '16px',
    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)', 
    zIndex: 100,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
});

const headerStyle = (isOpen) => ({
    height: '70px', 
    padding: isOpen ? '0 24px' : '0', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: isOpen ? 'space-between' : 'center',
    borderBottom: isOpen ? '1px solid rgba(255,255,255,0.08)' : 'none',
    background: isOpen ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)' : 'transparent',
    transition: 'all 0.3s'
});

const headerTitleStyle = { 
    fontWeight: 800, fontSize: '14px', letterSpacing: '1px', color: THEME.textMain 
};
const headerSubtitleStyle = { 
    fontWeight: 400, fontSize: '11px', color: THEME.textMuted 
};

const toggleButtonStyle = {
    background: 'rgba(255,255,255,0.08)', border: 'none', color: THEME.textMain, 
    cursor: 'pointer', borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', 
    width: '32px', height: '32px', fontSize: '14px',
    transition: 'background 0.2s',
    ':hover': { background: 'rgba(255,255,255,0.15)' }
};

const verticalTextContainerStyle = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '20px'
};

const verticalTextStyle = {
    writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)',
    color: '#666666', // Neutral watermark
    letterSpacing: '6px', fontSize: '13px', fontWeight: '800', opacity: 0.6
};

const contentWrapperStyle = { 
    display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' 
};

// --- NAVIGATION TABS ---

const tabContainerStyle = {
    display: 'flex', padding: '16px 16px 0 16px', gap: '12px', 
    borderBottom: '1px solid rgba(255,255,255,0.05)'
};

const tabStyle = (isActive) => ({
    flex: 1, padding: '10px 0', fontSize: '11px', fontWeight: '700',
    backgroundColor: 'transparent',
    color: isActive ? THEME.primary : '#888888', 
    borderBottom: isActive ? `2px solid ${THEME.primary}` : '2px solid transparent',
    cursor: 'pointer', letterSpacing: '0.5px', transition: 'all 0.2s',
    border: 'none',
    borderBottom: isActive ? `2px solid ${THEME.primary}` : '2px solid transparent',
});

const scrollAreaStyle = { 
    flex: 1, overflowY: 'auto', padding: '0 0 20px 0' 
};

const sectionStyle = { 
    padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' 
};

const subHeaderStyle = { 
    fontSize: '11px', fontWeight: '800', color: '#777777', 
    marginBottom: '12px', letterSpacing: '1px', textTransform: 'uppercase' 
};

// --- ROW ITEMS ---

const rowStyle = (isActive) => ({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px', borderRadius: '10px', cursor: 'pointer',
    backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
    border: '1px solid',
    borderColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
    transition: 'all 0.2s',
    marginBottom: '4px'
});

const featureCardStyle = (isActive) => ({
    display: 'flex', flexDirection: 'column',
    padding: '12px', borderRadius: '10px', cursor: 'pointer',
    backgroundColor: isActive ? `${THEME.primary}15` : 'rgba(255,255,255,0.03)',
    border: '1px solid',
    borderColor: isActive ? `${THEME.primary}40` : 'transparent',
    transition: 'all 0.2s',
    marginBottom: '6px'
});

const featureCardTopRowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%'
};

const structuralLabelGroupStyle = { 
    display: 'flex', alignItems: 'center', gap: '12px', flex: 1
};

const featureLabelGroupStyle = { 
    display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1
};

const iconCenterWrapperStyle = {
    width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
};

const iconTopWrapperStyle = {
    width: '24px', display: 'flex', justifyContent: 'center', flexShrink: 0, marginTop: '2px' 
};

const textStyle = (isActive) => ({ 
    color: isActive ? THEME.textMain : THEME.textMuted, 
    fontSize: '13px', fontWeight: '500' 
});

const featureTitleStyle = (isActive) => ({
    color: isActive ? '#ffffff' : THEME.textMain,
    fontSize: '13px', fontWeight: '600', marginBottom: '2px', display: 'block'
});

const featureTextGroup = { 
    display: 'flex', flexDirection: 'column', flex: 1 
};

const metaRowStyle = {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'
};

const scoreBadgeStyle = { 
    fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px'
};

const descriptionContainerStyle = {
    display: 'flex', alignItems: 'flex-start', gap: '8px', 
    marginTop: '10px', padding: '10px 12px', 
    backgroundColor: 'rgba(255, 255, 255, 0.04)', 
    borderRadius: '8px',
    borderLeft: `3px solid ${THEME.primary}80`,
    width: '100%', boxSizing: 'border-box' 
};

const descriptionStyle = {
    fontSize: '12px', color: '#cccccc', // Neutral bright silver
    lineHeight: '1.5', fontStyle: 'italic', fontWeight: '400'
};

// --- VISUAL INDICATORS ---

const dotStyle = (color, isVisible) => ({
    width: '8px', height: '8px', borderRadius: '50%',
    backgroundColor: color, 
    boxShadow: isVisible ? `0 0 10px ${color}` : 'none',
    opacity: isVisible ? 1 : 0.3,
    transition: 'all 0.3s'
});

const featureIconStyle = (category) => ({
    fontSize: '16px', opacity: category === 'Infrastructure' ? 0.7 : 1, filter: 'grayscale(0.2)'
});

const circleCheckboxStyle = (isActive) => ({
    width: '20px', height: '20px', borderRadius: '50%',
    border: `2px solid ${isActive ? THEME.primary : THEME.border}`,
    backgroundColor: isActive ? THEME.primary : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', 
    boxShadow: isActive ? `0 0 12px ${THEME.primary}60` : 'none',
    flexShrink: 0, marginTop: '2px'
});

const checkIconStyle = {
    color: '#ffffff', fontSize: '12px', fontWeight: 'bold'
};

const visibilityToggleStyle = (isVisible) => ({
    fontSize: '10px', fontWeight: '700',
    color: isVisible ? '#ffffff' : '#888888',
    background: isVisible ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.3)',
    padding: '2px 8px', borderRadius: '12px',
    minWidth: '30px', textAlign: 'center'
});

// --- STATES ---

const loadingStateStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '16px', padding: '40px 20px', color: THEME.textMuted, fontSize: '13px'
};

const emptyStateStyle = {
    padding: '40px 20px', color: THEME.textMuted, fontSize: '13px',
    textAlign: 'center', lineHeight: '1.6',
    background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
    margin: '10px'
};

const spinnerStyle = {
    width: '24px', height: '24px', borderRadius: '50%',
    border: '3px solid rgba(255,255,255,0.1)',
    borderTop: `3px solid ${THEME.primary}`,
    animation: 'spin 1s linear infinite'
};

export default SidebarPanel;