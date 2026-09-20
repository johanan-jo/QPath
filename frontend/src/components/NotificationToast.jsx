import React from 'react';

export default function NotificationToast({ notification, onDismiss }) {
  if (!notification) return null;

  const typeStyles = {
    warning: {
      border: '1px solid #f59e0b',
      background: 'rgba(245, 158, 11, 0.15)',
      color: '#fbbf24',
      icon: '⚠️'
    },
    success: {
      border: '1px solid #10b981',
      background: 'rgba(16, 185, 129, 0.15)',
      color: '#34d399',
      icon: '✨'
    },
    info: {
      border: '1px solid #3b82f6',
      background: 'rgba(59, 130, 246, 0.15)',
      color: '#60a5fa',
      icon: 'ℹ️'
    }
  };

  const style = typeStyles[notification.type || 'info'] || typeStyles.info;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      maxWidth: '420px',
      padding: '14px 18px',
      borderRadius: '10px',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      animation: 'slideIn 0.3s ease-out',
      ...style
    }}>
      <span style={{ fontSize: '20px', flexShrink: 0 }}>{style.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
          {notification.title || 'Dynamic Traffic Update'}
        </div>
        <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.4 }}>
          {notification.message}
        </div>
        {notification.savings && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#10b981', fontWeight: 'bold' }}>
            {notification.savings}
          </div>
        )}
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          fontSize: '18px',
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1
        }}
      >
        ×
      </button>
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
