import React, { useState, useRef, useEffect } from 'react';
import { verifyDeliveryOTP } from '../services/api';

/* ─────────────────────────────────────────────────────────────────
   OTPVerifyModal — Embedded in DriverDashboard stop cards.
   Driver enters the customer's 6-digit OTP to verify delivery.
   Backend is sole authority — no client-side OTP logic.
───────────────────────────────────────────────────────────────────── */

const STYLES = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.75)', zIndex: 9000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '20px',
    padding: '32px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
    animation: 'slideUp 0.2s ease',
  },
  title: {
    fontSize: '20px', fontWeight: 800, color: '#f1f5f9', marginBottom: '6px',
  },
  sub: {
    fontSize: '13px', color: '#64748b', lineHeight: 1.5, marginBottom: '24px',
  },
  stopName: { fontWeight: 600, color: '#60a5fa' },
  // OTP input row
  digitRow: {
    display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '20px',
  },
  digit: (focused, hasValue, error) => ({
    width: '48px', height: '56px',
    background: '#0f172a',
    border: `2px solid ${error ? '#ef4444' : focused ? '#3b82f6' : hasValue ? '#10b981' : '#334155'}`,
    borderRadius: '10px',
    textAlign: 'center',
    fontSize: '26px', fontWeight: 700,
    color: '#f1f5f9',
    outline: 'none',
    transition: 'border-color 0.15s',
    caretColor: 'transparent',
  }),
  // Feedback
  error: {
    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px', padding: '10px 14px', fontSize: '13px',
    color: '#fca5a5', marginBottom: '16px',
  },
  success: {
    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: '8px', padding: '10px 14px', fontSize: '13px',
    color: '#6ee7b7', marginBottom: '16px',
  },
  info: {
    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
    borderRadius: '8px', padding: '10px 14px', fontSize: '12px',
    color: '#93c5fd', marginBottom: '16px',
    lineHeight: 1.5,
  },
  btnRow: { display: 'flex', gap: '10px' },
  btn: (color, disabled) => ({
    flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
    background: disabled ? '#334155' : color || '#3b82f6',
    color: disabled ? '#64748b' : '#fff',
    fontWeight: 700, fontSize: '14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.15s',
  }),
};

export default function OTPVerifyModal({ stop, driverId, driverGps, onSuccess, onCancel }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    // Auto-focus first digit on open
    setTimeout(() => inputRefs.current[0]?.focus(), 80);
  }, []);

  const otp = digits.join('');

  const handleDigit = (idx, val) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[idx] = v;
    setDigits(newDigits);
    setError(null);

    if (v && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
      setFocusIdx(idx + 1);
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      const newDigits = [...digits];
      newDigits[idx - 1] = '';
      setDigits(newDigits);
      inputRefs.current[idx - 1]?.focus();
      setFocusIdx(idx - 1);
    } else if (e.key === 'Enter' && otp.length === 6) {
      handleSubmit();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      setError(null);
      inputRefs.current[5]?.focus();
      setFocusIdx(5);
    }
    e.preventDefault();
  };

  const handleSubmit = async () => {
    if (otp.length !== 6) {
      setError('Please enter the full 6-digit OTP.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await verifyDeliveryOTP(stop.id, otp, driverId, driverGps);
      setSuccess(true);
      setTimeout(() => onSuccess(res.data), 1200);
    } catch (e) {
      setError(e.response?.data?.detail || 'OTP verification failed. Please try again.');
      // Clear digits on error
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
        setFocusIdx(0);
      }, 50);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={STYLES.overlay} onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}>
      <div style={STYLES.modal}>
        <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{ fontSize: '30px', marginBottom: '12px' }}>🔐</div>
        <div style={STYLES.title}>OTP Verification</div>
        <div style={STYLES.sub}>
          Ask the customer for their 6-digit OTP to complete delivery to{' '}
          <span style={STYLES.stopName}>{stop?.name || 'this stop'}</span>.
        </div>

        {/* Info */}
        <div style={STYLES.info}>
          💡 The customer can see their OTP in their <strong>QPath Customer Dashboard</strong>.
          Enter the code below exactly as provided.
        </div>

        {/* OTP Digit Inputs */}
        {!success && (
          <div style={STYLES.digitRow} onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => inputRefs.current[i] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                style={STYLES.digit(focusIdx === i, !!d, !!error)}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onFocus={() => setFocusIdx(i)}
                disabled={loading || success}
              />
            ))}
          </div>
        )}

        {/* Feedback */}
        {error && <div style={STYLES.error}>⚠️ {error}</div>}
        {success && (
          <div style={{ ...STYLES.success, textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>OTP Verified!</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Delivery marked as completed.</div>
          </div>
        )}

        {/* Buttons */}
        {!success && (
          <div style={STYLES.btnRow}>
            <button style={STYLES.btn('#475569', loading)} onClick={onCancel} disabled={loading}>
              Cancel
            </button>
            <button
              style={STYLES.btn('#10b981', loading || otp.length < 6)}
              onClick={handleSubmit}
              disabled={loading || otp.length < 6}
            >
              {loading ? '⏳ Verifying…' : '✓ Verify & Complete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
