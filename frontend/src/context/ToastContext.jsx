import React, { createContext, useContext, useState, useCallback } from 'react';
import { THEME } from '../config/graphConfig';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    // Function to add a new toast
    const showToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto remove after 4 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    // Function to manually remove a toast
    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            
            {/* --- TOAST CONTAINER UI --- */}
            <div style={styles.container}>
                {toasts.map(toast => (
                    <div key={toast.id} style={{...styles.toast, ...styles[toast.type]}}>
                        <span>{toast.message}</span>
                        <button onClick={() => removeToast(toast.id)} style={styles.closeBtn}>×</button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

// --- STYLES ---
const styles = {
    container: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
    },
    toast: {
        minWidth: '250px',
        maxWidth: '350px',
        padding: '12px 16px',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '13px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        animation: 'slideIn 0.3s ease-out',
        fontFamily: "'Inter', sans-serif"
    },
    // Variants
    success: {
        backgroundColor: '#1e1e1e',
        borderLeft: `4px solid ${THEME.success}`,
        border: `1px solid ${THEME.border}`
    },
    error: {
        backgroundColor: '#1e1e1e',
        borderLeft: `4px solid ${THEME.danger}`,
        border: `1px solid ${THEME.border}`
    },
    info: {
        backgroundColor: '#1e1e1e',
        borderLeft: `4px solid ${THEME.primary}`,
        border: `1px solid ${THEME.border}`
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        color: '#aaa',
        fontSize: '18px',
        cursor: 'pointer',
        marginLeft: '10px'
    }
};