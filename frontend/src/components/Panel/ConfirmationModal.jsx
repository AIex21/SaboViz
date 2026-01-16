import React from 'react';
import { THEME } from '../../config/graphConfig';
import ModalButton from '../Common/ModalButton';

const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    return (
        <div style={styles.overlay} onClick={onCancel}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <h3 style={styles.title}>{title}</h3>
                
                {/* Body */}
                <p style={styles.message}>{message}</p>
                
                {/* Footer / Actions */}
                <div style={styles.actions}>
                    {/* 2. Use ModalButton for Cancel */}
                    <ModalButton 
                        variant="secondary" 
                        onClick={onCancel}
                    >
                        Cancel
                    </ModalButton>

                    {/* 3. Use ModalButton for Delete (Danger) */}
                    <ModalButton 
                        variant="danger" 
                        onClick={onConfirm}
                    >
                        Delete Project
                    </ModalButton>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
    },
    modal: {
        width: '400px',
        backgroundColor: '#1e1e1e', // THEME.panelBg
        border: `1px solid ${THEME.border}`,
        borderRadius: '16px', // Matched UnresolvedModal radius
        padding: '24px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        animation: 'fadeIn 0.2s ease-out'
    },
    title: {
        marginTop: 0,
        marginBottom: '10px',
        color: '#fff',
        fontSize: '20px',
        fontWeight: '600'
    },
    message: {
        color: '#a0a0a0', // THEME.textMuted
        fontSize: '14px',
        marginBottom: '24px',
        lineHeight: '1.5'
    },
    actions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px'
    }
};

export default ConfirmationModal;