import React, { useState } from 'react';
import { THEME } from '../../config/graphConfig';

const ModalButton = ({ 
    children, 
    onClick, 
    variant = 'primary', 
    style = {}, 
    disabled = false,
    type = 'button'
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isActive, setIsActive] = useState(false);

    // --- BASE STYLES ---
    let buttonStyle = {
        padding: '10px 24px',
        borderRadius: '8px',
        fontWeight: '700',
        fontSize: '13px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
        outline: 'none',
        transition: 'all 0.2s ease',
        transform: isActive && !disabled ? 'translateY(1px)' : 'translateY(0)',
        opacity: disabled ? 0.6 : 1,
        ...style
    };

    // --- VARIANT STYLES ---
    if (variant === 'primary') {
        buttonStyle.backgroundColor = isHovered && !disabled ? THEME.primaryHover : THEME.primary;
        buttonStyle.color = '#fff';
        buttonStyle.boxShadow = isHovered && !disabled ? `0 4px 12px ${THEME.primary}40` : 'none';
    
    } else if (variant === 'danger') {
        // Outline style by default, solid on hover
        buttonStyle.backgroundColor = isHovered && !disabled ? THEME.danger : 'transparent';
        buttonStyle.border = `1px solid ${THEME.danger}`;
        buttonStyle.color = isHovered && !disabled ? '#fff' : THEME.danger;
    
    } else if (variant === 'secondary') {
        // Ghost style
        buttonStyle.backgroundColor = 'transparent';
        buttonStyle.color = isHovered && !disabled ? THEME.textMain : THEME.textMuted;
        buttonStyle.border = '1px solid transparent';
        if (isHovered && !disabled) {
            buttonStyle.backgroundColor = 'rgba(255,255,255,0.05)';
        }
    }

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsActive(false); }}
            onMouseDown={() => setIsActive(true)}
            onMouseUp={() => setIsActive(false)}
            style={buttonStyle}
        >
            {children}
        </button>
    );
};

export default ModalButton;