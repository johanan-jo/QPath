import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getCustomerDeliveryStatus, customerRegenerateOTP } from '../services/api';

/* ─────────────────────────────────────────────────────────────────
   CustomerDashboard — accessed via token in URL query string
   e.g. http://localhost:3000?customer=YOUR_TOKEN
   Customers see only their own delivery info.
───────────────────────────────────────────────────────────────────── */

const STEPS = [
  { id: 1, icon: '📦', label: 'Order Confirmed' },
  { id: 2, icon: '🚚', label: 'Out for Delivery' },
  { id: 3, icon: '📍', label: 'Driver Approaching' },
  { id: 4, icon: '🔐', label: 'OTP Verification' },
  { id: 5, icon: '✅', label: 'Delivered' },
];

const STATUS_STEP_MAP = {
  'Pending': 1,
  'In Progress': 2,
  'Delivering': 2,
  'Delivered': 5,
  'Failed': 4,
  'Returned to Hub & Checked In': 4,
};

const S = {
  outer: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 0 48px 0',
  },
  header: {
    width: '100%',
    background: 'rgba(30,41,59,0.95)',
    borderBottom: '1px solid #334155',
    padding: '14px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '32px',
  },
  logo: { fontSize: '22px', fontWeight: 900, color: '#60a5fa', letterSpacing: '-0.5px' },
  badge: {
    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
    background: 'rgba(59,130,246,0.18)', color: '#60a5fa',
  },
  card: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '16px',
    padding: '28px',
    width: '100%',
    maxWidth: '560px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '11px', fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '16px',
  },
  // OTP display box
  otpBox: {
    background: 'rgba(59,130,246,0.12)',
    border: '2px dashed #3b82f6',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
    marginBottom: '16px',
  },
  otpLabel: { fontSize: '12px', color: '#94a3b8', marginBottom: '8px' },
  otpCode: {
    fontSize: '38px', fontWeight: 900, letterSpacing: '10px',
    color: '#60a5fa', fontVariantNumeric: 'tabular-nums',
  },
  otpExpiry: { fontSize: '11px', color: '#64748b', marginTop: '8px' },
  // Progress stepper
  stepRow: { display: 'flex', alignItems: 'flex-start', gap: '0' },
  stepDot: (active, done) => ({
    width: '32px', height: '32px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', flexShrink: 0,
    background: done ? '#10b981' : active ? '#3b82f6' : '#1e293b',
    border: `2px solid ${done ? '#10b981' : active ? '#3b82f6' : '#334155'}`,
    boxShadow: active ? '0 0 12px rgba(59,130,246,0.5)' : 'none',
    transition: 'all 0.3s ease',
  }),
  stepLine: (done) => ({
    width: '2px', flex: 1, minHeight: '28px', margin: '4px 0',
    background: done ? '#10b981' : '#334155',
    marginLeft: '15px',
    transition: 'background 0.3s ease',
  }),
  stepLabel: (active, done) => ({
    fontSize: '13px', fontWeight: active ? 700 : 400,
    color: done ? '#10b981' : active ? '#60a5fa' : '#64748b',
  }),
  stepDesc: { fontSize: '11px', color: '#64748b', marginTop: '2px' },
  // Info rows
  infoRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid #1e293b',
  },
  infoLabel: { fontSize: '12px', color: '#64748b' },
  infoValue: { fontSize: '13px', fontWeight: 600, color: '#f1f5f9', textAlign: 'right', maxWidth: '60%' },
  // Status pill
  pill: (color) => ({
    display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
    fontSize: '11px', fontWeight: 700,
    background: `${color}22`, color: color, border: `1px solid ${color}44`,
  }),
  // Buttons
  btn: (color) => ({
    padding: '10px 20px', borderRadius: '8px', border: 'none',
    background: color || '#3b82f6', color: '#fff',
    fontWeight: 700, fontSize: '13px', cursor: 'pointer',
    transition: 'opacity 0.15s',
  }),
  // Error / info
  errorBox: {
    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '12px', padding: '20px', textAlign: 'center',
    maxWidth: '400px', margin: '0 auto',
  },
  loadingPulse: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '12px', padding: '64px 0',
  },
};

function StatusPill({ status }) {
  const colors = {
    'Delivered': '#10b981',
    'Pending': '#f59e0b',
    'In Progress': '#3b82f6',
    'Failed': '#ef4444',
    'Returned to Hub & Checked In': '#8b5cf6',
    'Verified': '#10b981',
    'Active': '#3b82f6',
    'Expired': '#ef4444',
  };
  const color = colors[status] || '#94a3b8';
  return <span style={S.pill(color)}>{status}</span>;
}

function ProgressStepper({ currentStep, failed }) {
  const steps = failed
    ? [...STEPS.slice(0, 3), { id: 4, icon: '⚠️', label: 'Not Delivered' }, STEPS[4]]
    : STEPS;

  return (
    <div>
      {steps.map((step, idx) => {
        const done = currentStep > step.id;
        const active = currentStep === step.id;
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.id}>
            <div style={S.stepRow}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '16px' }}>
                <div style={S.stepDot(active, done)}>
                  {done ? '✓' : step.icon}
                </div>
                {!isLast && <div style={S.stepLine(done)} />}
              </div>
              <div style={{ paddingTop: '6px', paddingBottom: isLast ? 0 : '28px' }}>
                <div style={S.stepLabel(active, done)}>{step.label}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LivePulse() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      fontSize: '11px', color: '#10b981',
    }}>
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%', background: '#10b981',
        animation: 'pulse-ring 1.4s infinite',
        display: 'inline-block',
      }} />
      LIVE
    </span>
  );
}

function CountdownTimer({ generatedAt, expiresIn }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!expiresIn) return;
    const startTime = Date.now();
    const totalMs = expiresIn * 60 * 1000; // convert minutes to ms

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const left = Math.max(0, totalMs - elapsed);
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresIn]);

  if (remaining === null) return null;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const expired = remaining === 0;
  return (
    <span style={{ color: expired ? '#ef4444' : '#94a3b8', fontSize: '11px' }}>
      {expired ? '⏰ OTP Expired' : `⏱ Expires in ${mins}m ${secs}s`}
    </span>
  );
}

export default function CustomerDashboard({ token, onExit }) {
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenMsg, setRegenMsg] = useState(null);
  const [newOTP, setNewOTP] = useState(null);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getCustomerDeliveryStatus(token);
      setDelivery(res.data);
      setError(null);
    } catch (e) {
      if (loading) {
        setError(e.response?.data?.detail || 'Invalid delivery token or delivery not found.');
      }
    } finally {
      setLoading(false);
    }
  }, [token, loading]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 6000);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  const handleRegenOTP = async () => {
    setRegenLoading(true);
    setRegenMsg(null);
    try {
      const res = await customerRegenerateOTP(token);
      setNewOTP(res.data.otp);
      setRegenMsg({ type: 'success', text: 'New OTP generated! Share it with the delivery driver.' });
      fetchStatus();
    } catch (e) {
      setRegenMsg({ type: 'error', text: e.response?.data?.detail || 'Failed to generate new OTP.' });
    } finally {
      setRegenLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={S.outer}>
        <div style={S.header}>
          <span style={{ fontSize: '22px' }}>⚛</span>
          <span style={S.logo}>QPath</span>
          <span style={S.badge}>CUSTOMER TRACKING</span>
          {onExit && (
            <button
              onClick={onExit}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Exit Tracking
            </button>
          )}
        </div>
        <div style={S.loadingPulse}>
          <div style={{ fontSize: '36px', animation: 'spin 1.2s linear infinite' }}>⚛</div>
          <div style={{ color: '#64748b', fontSize: '14px' }}>Loading your delivery status…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.outer}>
        <div style={S.header}>
          <span style={{ fontSize: '22px' }}>⚛</span>
          <span style={S.logo}>QPath</span>
          <span style={S.badge}>CUSTOMER TRACKING</span>
          {onExit && (
            <button
              onClick={onExit}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Back to Portal
            </button>
          )}
        </div>
        <div style={{ padding: '64px 24px' }}>
          <div style={S.errorBox}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>❌</div>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px', color: '#ef4444' }}>
              Delivery Not Found
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>{error}</div>
            <div style={{ marginTop: '16px', fontSize: '12px', color: '#64748b' }}>
              Please check your delivery token and try again, or contact support.
            </div>
            {onExit && (
              <button
                onClick={onExit}
                style={{
                  marginTop: '16px',
                  background: '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Go to Login
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!delivery) return null;

  const isFailed = delivery.status === 'Failed' || delivery.status === 'Returned to Hub & Checked In';
  const isDelivered = delivery.status === 'Delivered';
  const currentStep = STATUS_STEP_MAP[delivery.status] || 2;
  const otpToDisplay = newOTP || delivery.otp_display;
  const otpExpired = delivery.otp_status === 'Expired';
  const otpVerified = delivery.otp_status === 'Verified';

  return (
    <div style={S.outer}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={S.header}>
        <span style={{ fontSize: '22px' }}>⚛</span>
        <span style={S.logo}>QPath</span>
        <span style={S.badge}>CUSTOMER TRACKING</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <LivePulse />
          {onExit && (
            <button
              onClick={onExit}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#94a3b8',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Exit Tracking
            </button>
          )}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '560px', padding: '0 16px' }}>

        {/* ── Greeting & Delivery ID ── */}
        <div style={{ ...S.card, textAlign: 'center', borderColor: isDelivered ? '#10b981' : isFailed ? '#ef4444' : '#3b82f6' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>
            {isDelivered ? '✅' : isFailed ? '⚠️' : '📦'}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>
            {isDelivered ? 'Delivered!' : isFailed ? 'Delivery Attempted' : 'Your Delivery is On the Way'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
            Hi {delivery.customer_name} — here's your live delivery status
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <StatusPill status={delivery.status} />
            <span style={{ fontSize: '11px', color: '#64748b', alignSelf: 'center' }}>
              ID: {delivery.delivery_id}
            </span>
          </div>
        </div>

        {/* ── OTP Box (only when not yet delivered and OTP exists) ── */}
        {!isDelivered && (
          <div style={S.card}>
            <div style={S.sectionTitle}>🔐 Your Delivery OTP</div>
            {otpVerified ? (
              <div style={{ ...S.otpBox, borderColor: '#10b981', background: 'rgba(16,185,129,0.08)' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: 700, color: '#10b981', fontSize: '16px' }}>OTP Verified</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Your delivery has been verified and completed.
                </div>
              </div>
            ) : otpToDisplay && !otpExpired ? (
              <div style={S.otpBox}>
                <div style={S.otpLabel}>Share this code with your delivery driver:</div>
                <div style={S.otpCode}>{otpToDisplay}</div>
                <div style={S.otpExpiry}>
                  <CountdownTimer expiresIn={delivery.otp_status === 'Active' ? 30 : 0} />
                </div>
              </div>
            ) : (
              <div style={{ ...S.otpBox, borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏰</div>
                <div style={{ fontWeight: 700, color: '#ef4444', fontSize: '15px', marginBottom: '4px' }}>
                  {otpExpired ? 'OTP Expired' : 'No OTP available yet'}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>
                  {otpExpired
                    ? 'Your OTP has expired. Request a new one below.'
                    : 'An OTP will be generated when your delivery is ready.'}
                </div>
                {otpExpired && (
                  <button
                    style={S.btn('#f59e0b')}
                    onClick={handleRegenOTP}
                    disabled={regenLoading}
                  >
                    {regenLoading ? '⏳ Generating…' : '🔄 Request New OTP'}
                  </button>
                )}
              </div>
            )}
            {regenMsg && (
              <div style={{
                marginTop: '10px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
                background: regenMsg.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: regenMsg.type === 'success' ? '#10b981' : '#ef4444',
                border: `1px solid ${regenMsg.type === 'success' ? '#10b981' : '#ef4444'}44`,
              }}>
                {regenMsg.text}
              </div>
            )}
            {newOTP && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
                💡 Keep this code safe — share only with your delivery driver.
              </div>
            )}
          </div>
        )}

        {/* ── Tracking Progress ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}>📍 Delivery Progress</div>
          <ProgressStepper currentStep={currentStep} failed={isFailed} />
        </div>

        {/* ── Delivery Details ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}>📋 Delivery Details</div>
          {[
            { label: 'Destination', value: delivery.destination?.name || '—' },
            { label: 'Driver', value: delivery.driver_name || 'Assigning driver…' },
            { label: 'Driver Status', value: delivery.driver_status || '—' },
            {
              label: 'Stops Before You',
              value: isDelivered ? '—' : `${delivery.stops_before} stop${delivery.stops_before !== 1 ? 's' : ''}`
            },
            {
              label: 'Estimated Arrival',
              value: isDelivered
                ? `Delivered at ${delivery.delivered_at || '—'}`
                : `~${delivery.eta_minutes} minutes`
            },
            { label: 'OTP Status', value: <StatusPill status={delivery.otp_status || '—'} /> },
          ].map(({ label, value }) => (
            <div key={label} style={S.infoRow}>
              <span style={S.infoLabel}>{label}</span>
              <span style={S.infoValue}>{value}</span>
            </div>
          ))}
          {isFailed && delivery.failed_reason && (
            <div style={{
              marginTop: '12px', padding: '12px', borderRadius: '8px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              fontSize: '13px', color: '#fca5a5',
            }}>
              <span style={{ fontWeight: 700 }}>Reason: </span>{delivery.failed_reason}
            </div>
          )}
        </div>

        {/* ── Map Hint (Depot info) ── */}
        <div style={{ ...S.card, background: 'rgba(30,41,59,0.6)' }}>
          <div style={S.sectionTitle}>🏢 Distribution Hub</div>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            {delivery.depot?.name || 'Connaught Place Central Depot, New Delhi'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            All deliveries originate from this hub
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', fontSize: '11px', color: '#475569', padding: '12px 0' }}>
          ⚛ QPath — Quantum-Inspired Delivery Routing · Auto-refreshing every 6s<br />
          <span style={{ fontSize: '10px', color: '#334155' }}>Delivery ID: {delivery.delivery_id}</span>
        </div>
      </div>
    </div>
  );
}
