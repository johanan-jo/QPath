import React, { useState } from 'react';
import { Shield, Truck, Lock, User, ArrowRight, AlertCircle, Sparkles, Navigation } from 'lucide-react';
import { loginUser } from '../services/api';

export default function LoginPage({ onLoginSuccess, onTrackCustomer }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customerTokenInput, setCustomerTokenInput] = useState('');

  const handleTrackSubmit = (e) => {
    e.preventDefault();
    if (!customerTokenInput.trim()) return;
    if (onTrackCustomer) {
      onTrackCustomer(customerTokenInput.trim());
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await loginUser(username.trim(), password.trim());
      const { token, user } = res.data;
      localStorage.setItem('qpath_auth_token', token);
      localStorage.setItem('qpath_user', JSON.stringify(user));
      if (onLoginSuccess) {
        onLoginSuccess(user, token);
      }
    } catch (err) {
      console.error('Login error:', err);
      const msg = err.response?.data?.detail || 'Authentication failed. Please verify credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#090d16',
      backgroundImage: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(59, 130, 246, 0.15), rgba(255, 255, 255, 0))',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: '#111827',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 20px rgba(59, 130, 246, 0.1)',
        padding: '36px 32px',
        boxSizing: 'border-box'
      }}>
        {/* Logo and Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
            color: '#fff',
            boxShadow: '0 8px 16px rgba(37, 99, 235, 0.35)',
            marginBottom: '16px'
          }}>
            <Navigation size={28} />
          </div>
          <h1 style={{
            margin: '0 0 6px 0',
            fontSize: '24px',
            fontWeight: '700',
            color: '#f8fafc',
            letterSpacing: '-0.025em'
          }}>
            QPath Logistics
          </h1>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#94a3b8',
            lineHeight: '1.4'
          }}>
            Quantum-Inspired Traffic & Real-Time Delivery Optimization
          </p>
        </div>

        {/* Demo Credentials Quick Fill Pills */}
        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '22px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: '600',
            color: '#38bdf8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px'
          }}>
            <Sparkles size={13} /> Quick-Fill Demo Credentials
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleQuickFill('admin', 'admin123')}
              style={{
                flex: '1 1 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px 10px',
                fontSize: '12px',
                fontWeight: '500',
                color: '#e2e8f0',
                backgroundColor: username === 'admin' ? '#1d4ed8' : '#1e293b',
                border: '1px solid',
                borderColor: username === 'admin' ? '#3b82f6' : '#334155',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Shield size={13} color="#60a5fa" />
              <span><strong>Admin:</strong> admin</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('driver1', 'driver1')}
              style={{
                flex: '1 1 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px 10px',
                fontSize: '12px',
                fontWeight: '500',
                color: '#e2e8f0',
                backgroundColor: username === 'driver1' ? '#0f766e' : '#1e293b',
                border: '1px solid',
                borderColor: username === 'driver1' ? '#14b8a6' : '#334155',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Truck size={13} color="#2dd4bf" />
              <span><strong>Driver:</strong> driver1</span>
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '13px',
            marginBottom: '18px'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#cbd5e1',
              marginBottom: '6px',
              letterSpacing: '0.02em'
            }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <User size={16} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or driver1"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  backgroundColor: '#0b1120',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '22px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#cbd5e1',
              marginBottom: '6px',
              letterSpacing: '0.02em'
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <Lock size={16} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  backgroundColor: '#0b1120',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Customer Delivery Tracking Section */}
        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '10px',
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#38bdf8',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>📦</span> Track Delivery (Customer Portal)
          </div>
          <form onSubmit={handleTrackSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={customerTokenInput}
              onChange={(e) => setCustomerTokenInput(e.target.value)}
              placeholder="Enter Delivery Token..."
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: '#0b1120',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!customerTokenInput.trim()}
              style={{
                padding: '8px 14px',
                background: customerTokenInput.trim() ? '#0284c7' : '#334155',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: '600',
                border: 'none',
                borderRadius: '6px',
                cursor: customerTokenInput.trim() ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              Track ➔
            </button>
          </form>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
            Customers can track arrival, ETA, and view their OTP without an account.
          </div>
        </div>

        {/* Security & Isolation Disclaimer */}
        <div style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid #1e293b',
          textAlign: 'center',
          fontSize: '11px',
          color: '#64748b',
          lineHeight: '1.5'
        }}>
          Role-based dispatch isolation enabled. Administrators manage full fleet schedules; Drivers access strictly assigned routes & live traffic.
        </div>
      </div>
    </div>
  );
}
