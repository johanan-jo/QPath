import React, { useState, useEffect, useCallback } from 'react';
import { verifyReturnAtHub, getAdminOTPVerificationTable, generateOTPForStop } from '../services/api';

const VEHICLE_THEME_COLORS = [
  { border: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', text: '#34d399', badge: '#10b981' }, // Vehicle 1: Emerald
  { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', text: '#22d3ee', badge: '#06b6d4' }, // Vehicle 2: Electric Cyan
  { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', badge: '#f59e0b' }, // Vehicle 3: Amber Gold
  { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', text: '#a78bfa', badge: '#8b5cf6' }, // Vehicle 4: Vivid Violet
  { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', text: '#f472b6', badge: '#ec4899' }  // Vehicle 5: Hot Pink
];

export default function VehicleDetailsPanel({
  vehicleRoutes = [],
  activeVehicleId,
  onSelectVehicle,
  params,
  setParams,
  onOpenDeliveryModal,
  onOptimize,
  onSimulateReroute,
  loading,
  comparison = [],
  onSwitchPage,
  liveDrivers = [],
  availableJobsCount = 0,
  pendingVerifications = [],
  onRefreshFleetLive
}) {
  // Extract QPSO vs other algorithms for comparison widget
  const qpsoItem = comparison?.find(c => c.algorithm?.toLowerCase().includes('qpso'));
  const otherItems = comparison?.filter(c => !c.algorithm?.toLowerCase().includes('qpso') && c.best_fitness);

  // Admin verification state
  const [verifyingJobId, setVerifyingJobId] = useState(null);
  const [verifySuccess, setVerifySuccess] = useState({});

  // OTP Verification Table state
  const [otpRows, setOtpRows] = useState([]);
  const [otpNotice, setOtpNotice] = useState(null);

  const fetchOtpRows = useCallback(async () => {
    try {
      const res = await getAdminOTPVerificationTable();
      if (res.data?.success) {
        setOtpRows(res.data.rows || []);
      }
    } catch (err) {
      console.warn('Failed to fetch OTP verification table:', err);
    }
  }, []);

  useEffect(() => {
    fetchOtpRows();
    const interval = setInterval(fetchOtpRows, 5000);
    return () => clearInterval(interval);
  }, [fetchOtpRows]);

  const handleGenerateOTPForStop = async (stopId, customerName) => {
    try {
      const res = await generateOTPForStop(stopId, customerName);
      if (res.data?.success) {
        setOtpNotice({
          stopId,
          otp: res.data.otp,
          customerToken: res.data.customer_token,
          message: `OTP Generated: ${res.data.otp} (Customer Token: ${res.data.customer_token})`
        });
        fetchOtpRows();
      }
    } catch (err) {
      console.error('Error generating OTP:', err);
    }
  };

  const handleVerifyReturn = async (jobId) => {
    setVerifyingJobId(jobId);
    try {
      const res = await verifyReturnAtHub(jobId);
      if (res.data.success) {
        setVerifySuccess(prev => ({ ...prev, [jobId]: true }));
        onRefreshFleetLive?.();
        fetchOtpRows();
        setTimeout(() => setVerifySuccess(prev => { const n = {...prev}; delete n[jobId]; return n; }), 4000);
      }
    } catch (err) {
      console.error('Error verifying hub return:', err);
    } finally {
      setVerifyingJobId(null);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      gap: '14px',
      paddingRight: '4px'
    }}>

      {/* ── Pending Verification Queue ─────────────────────────────── */}
      {pendingVerifications && pendingVerifications.length > 0 && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1.5px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📦</span> Deliverables Return & Verification Queue
            </span>
            <span style={{
              fontSize: '11px', color: '#f59e0b',
              background: 'rgba(245,158,11,0.15)', padding: '2px 8px', borderRadius: '10px'
            }}>
              {pendingVerifications.length} Pending
            </span>
          </div>

          {pendingVerifications.map((entry) => (
            <div key={entry.job_id} style={{
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: '10px', padding: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
                    {entry.driver_name} — {entry.job_id}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {entry.vehicle || ''} · Returned {entry.returned_to_hub_at ? new Date(entry.returned_to_hub_at).toLocaleTimeString() : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: '700', color: '#f59e0b',
                  background: 'rgba(245,158,11,0.15)', padding: '3px 8px',
                  borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)', flexShrink: 0
                }}>
                  ⏳ Awaiting Check-In
                </span>
              </div>

              {entry.undelivered_items && entry.undelivered_items.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: '600' }}>
                    Undelivered items ({entry.undelivered_items.length}):
                  </div>
                  {entry.undelivered_items.map((item, i) => (
                    <div key={i} style={{
                      fontSize: '11px', color: '#cbd5e1',
                      padding: '5px 8px', borderRadius: '6px',
                      backgroundColor: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      marginBottom: '4px'
                    }}>
                      <span style={{ fontWeight: '700' }}>{item.name || item.stop_id}</span>
                      {item.failed_reason && (
                        <span style={{ color: '#fca5a5', marginLeft: '6px' }}>— {item.failed_reason}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {verifySuccess[entry.job_id] ? (
                <div style={{
                  padding: '8px 12px', backgroundColor: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px',
                  fontSize: '12px', color: '#34d399', fontWeight: '600',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  ✅ Deliverables checked in & driver released!
                </div>
              ) : (
                <button
                  onClick={() => handleVerifyReturn(entry.job_id)}
                  disabled={verifyingJobId === entry.job_id}
                  style={{
                    width: '100%', padding: '9px 14px',
                    backgroundColor: verifyingJobId === entry.job_id ? '#334155' : '#059669',
                    color: '#ffffff', border: 'none', borderRadius: '8px',
                    fontSize: '12px', fontWeight: '700',
                    cursor: verifyingJobId === entry.job_id ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  {verifyingJobId === entry.job_id ? '⏳ Verifying...' : '✅ Verify & Check-In Deliverables'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Live Driver Fleet Dispatch Status Card */}
      {liveDrivers && liveDrivers.length > 0 && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📡</span> Live Driver Fleet Dispatch
            </span>
            <span style={{
              fontSize: '11px',
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.12)',
              padding: '2px 8px',
              borderRadius: '10px',
              border: '1px solid rgba(56, 189, 248, 0.25)'
            }}>
              {availableJobsCount} In Pool
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {liveDrivers.map((d, dIdx) => {
              const isDelivering = d.status === 'En Route' || d.status === 'Delivering' || d.status === 'Job Accepted';
              const isReturning = d.status === 'Returning to Hub';
              const isCompleted = d.status === 'Completed';
              const badgeColor = isReturning ? '#a78bfa' : isDelivering ? '#38bdf8' : isCompleted ? '#10b981' : '#94a3b8';
              const badgeBg = isReturning ? 'rgba(167, 139, 250, 0.18)' : isDelivering ? 'rgba(56, 189, 248, 0.15)' : isCompleted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)';

              return (
                <div
                  key={d.driver_id || dIdx}
                  style={{
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px' }}>🚚</span>
                      <strong style={{ fontSize: '12px', color: '#f8fafc' }}>{d.driver_name}</strong>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>({d.vehicle})</span>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      color: badgeColor,
                      backgroundColor: badgeBg,
                      border: `1px solid ${badgeColor}40`
                    }}>
                      {d.status}
                    </span>
                  </div>

                  {d.accepted_job_id ? (
                    <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Job: <strong style={{ color: '#38bdf8' }}>{d.accepted_job_id}</strong></span>
                        <span>
                          <strong style={{ color: '#10b981' }}>{d.completed_count} Delivered</strong>
                          {d.failed_count > 0 && (
                            <strong style={{ color: '#ef4444', marginLeft: '6px' }}>({d.failed_count} Undelivered)</strong>
                          )}
                        </span>
                      </div>
                      {d.failed_count > 0 && (
                        <div style={{ fontSize: '10px', color: '#f87171', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '3px 6px', borderRadius: '4px' }}>
                          ⚠️ Undelivered items returning to Hub
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                      Standing by at depot · Available to claim jobs
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Top Operations Header Box */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '15px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🚚</span> Fleet & Route Control
          </h2>
          <button
            onClick={onOpenDeliveryModal}
            style={{
              background: '#2563eb',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>+</span> Manage Stops
          </button>
        </div>

        {/* Fleet Configuration Quick Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              <span>Vehicles:</span>
              <strong style={{ color: '#38bdf8' }}>{params.numVehicles}</strong>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={params.numVehicles}
              onChange={(e) => setParams(p => ({ ...p, numVehicles: parseInt(e.target.value) }))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              <span>Capacity:</span>
              <strong style={{ color: '#38bdf8' }}>{params.vehicleCapacity} kg</strong>
            </div>
            <input
              type="range"
              min="20"
              max="200"
              step="10"
              value={params.vehicleCapacity}
              onChange={(e) => setParams(p => ({ ...p, vehicleCapacity: parseFloat(e.target.value) }))}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onOptimize('qpso')}
            disabled={loading}
            style={{
              flex: 1,
              background: loading ? '#475569' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: 'none',
              color: '#fff',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(37,99,235,0.4)'
            }}
          >
            <span>⚡</span> {loading ? 'Optimizing...' : 'Optimize (QPSO)'}
          </button>

          <button
            onClick={onSimulateReroute}
            disabled={loading}
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              color: '#f87171',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Inject real-time incident on active corridor to demonstrate dynamic rerouting"
          >
            <span>⚠️</span> Traffic Shock
          </button>
        </div>
      </div>

      {/* Vehicles List Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Vehicle Assignments ({vehicleRoutes.length || params.numVehicles})
        </span>
        {activeVehicleId && (
          <button
            onClick={() => onSelectVehicle(null)}
            style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '11px', cursor: 'pointer' }}
          >
            Show All Routes
          </button>
        )}
      </div>

      {/* Vehicle Cards */}
      {(!vehicleRoutes || vehicleRoutes.length === 0) ? (
        <div style={{
          background: '#1e293b',
          border: '1px dashed #334155',
          borderRadius: '10px',
          padding: '24px 16px',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '13px'
        }}>
          Click <strong>"⚡ Optimize Route"</strong> to generate multi-vehicle delivery schedules and traffic-aware turn-by-turn paths.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {vehicleRoutes.map((vRoute, idx) => {
            const theme = VEHICLE_THEME_COLORS[idx % VEHICLE_THEME_COLORS.length];
            const isSelected = activeVehicleId === vRoute.vehicle_id;

            return (
              <div
                key={vRoute.vehicle_id || idx}
                onClick={() => onSelectVehicle(isSelected ? null : vRoute.vehicle_id)}
                style={{
                  background: isSelected ? theme.bg : '#1e293b',
                  border: `2px solid ${isSelected ? theme.border : '#334155'}`,
                  borderRadius: '12px',
                  padding: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? `0 4px 20px ${theme.bg}` : 'none'
                }}
              >
                {/* Vehicle Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      background: theme.badge,
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      padding: '3px 8px',
                      borderRadius: '6px'
                    }}>
                      Vehicle {vRoute.vehicle_id}
                    </span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      ({vRoute.assigned_stops?.length || 0} stops)
                    </span>
                  </div>

                  <span style={{
                    fontSize: '11px',
                    color: theme.text,
                    background: theme.bg,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    border: `1px solid ${theme.border}`
                  }}>
                    {isSelected ? '🎯 Selected' : vRoute.status || 'Active'}
                  </span>
                </div>

                {/* Driver Assignment Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  marginBottom: '10px',
                  fontSize: '11px'
                }}>
                  <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    👤 Assigned Driver:
                  </span>
                  <span style={{ color: '#38bdf8', fontWeight: '600' }}>
                    {idx === 0 ? 'Rajesh Kumar (driver1)' : idx === 1 ? 'Amit Sharma (driver2)' : `Driver ${idx + 1}`}
                  </span>
                </div>

                {/* Delivery Sequence Line */}
                <div style={{
                  background: '#0f172a',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e2e8f0',
                  marginBottom: '10px',
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap'
                }}>
                  {vRoute.assigned_stops && vRoute.assigned_stops.length > 0 ? (
                    <>
                      <span style={{ color: '#10b981' }}>🏠 Start</span>
                      {vRoute.assigned_stops.map((stop, sIdx) => (
                        <React.Fragment key={sIdx}>
                          <span style={{ color: '#64748b' }}>➔</span>
                          <strong style={{ color: theme.text }}>{stop}</strong>
                        </React.Fragment>
                      ))}
                      <span style={{ color: '#64748b' }}>➔</span>
                      <span style={{ color: '#10b981' }}>🏠 Return</span>
                    </>
                  ) : (
                    <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                      🏠 Vehicle on standby at Depot (0 stops assigned)
                    </span>
                  )}
                </div>

                {/* Key Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', marginBottom: '10px' }}>
                  <div style={{ background: '#0f172a', padding: '6px 8px', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '10px' }}>TOTAL DISTANCE</span>
                    <div style={{ fontWeight: 'bold', color: '#f8fafc' }}>{vRoute.total_distance_km || 0} km</div>
                  </div>
                  <div style={{ background: '#0f172a', padding: '6px 8px', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '10px' }}>TRAVEL TIME</span>
                    <div style={{ fontWeight: 'bold', color: '#f8fafc' }}>{vRoute.total_time_min || 0} min</div>
                  </div>
                  <div style={{ background: '#0f172a', padding: '6px 8px', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '10px' }}>CONGESTION INDEX</span>
                    <div style={{ fontWeight: 'bold', color: (vRoute.average_congestion_pct || 0) > 50 ? '#f59e0b' : '#10b981' }}>
                      {vRoute.average_congestion_pct || 0}% Avg
                    </div>
                  </div>
                  <div style={{ background: '#0f172a', padding: '6px 8px', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '10px' }}>FLEET OP. COST</span>
                    <div style={{ fontWeight: 'bold', color: '#f8fafc' }}>₹{vRoute.total_op_cost_inr?.toFixed(0) || 0}</div>
                  </div>
                </div>

                {/* Stop by Stop Detailed Timeline */}
                <div style={{ borderTop: '1px solid #334155', paddingTop: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold' }}>
                    Turn-by-Turn Stop Schedule:
                  </div>
                  {vRoute.legs && vRoute.legs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {vRoute.legs.map((leg, lIdx) => {
                        const trafficCol = leg.traffic_color || (leg.congestion_pct < 35 ? '#10b981' : leg.congestion_pct < 65 ? '#f59e0b' : '#ef4444');
                        return (
                          <div
                            key={lIdx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '11px',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              background: '#0f172a'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: trafficCol }}/>
                              <span style={{ color: '#cbd5e1' }}>
                                Leg {leg.leg_index}: {leg.to_name}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', color: '#94a3b8' }}>
                              <span>{leg.distance_km} km</span>
                              <strong style={{ color: '#38bdf8' }}>ETA {leg.estimated_arrival_clock}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ color: '#64748b', fontSize: '11px', fontStyle: 'italic', padding: '4px 0' }}>
                      No active legs — vehicle is standing by.
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* LIVE ALGORITHM PERFORMANCE BENCHMARK SUMMARY (Visible in Route Operations) */}
      {comparison && comparison.length > 0 && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '14px',
          marginTop: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>📊</span> Live Benchmark Comparison
            </span>
            <button
              onClick={() => onSwitchPage && onSwitchPage('comparison')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#60a5fa',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Full Suite ➔
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {comparison.map((c, i) => {
              const isQpso = c.algorithm?.toLowerCase().includes('qpso');
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '11px',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    background: isQpso ? 'rgba(37, 99, 235, 0.20)' : '#0f172a',
                    border: isQpso ? '1px solid #3b82f6' : '1px solid #1e293b'
                  }}
                >
                  <span style={{ fontWeight: isQpso ? 'bold' : 'normal', color: isQpso ? '#60a5fa' : '#cbd5e1' }}>
                    {isQpso ? '⚡ ' : ''}{c.algorithm}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', color: '#94a3b8' }}>
                    <span>{c.total_travel_time ? `${c.total_travel_time.toFixed(1)}m` : '-'}</span>
                    <span>{c.total_distance ? `${c.total_distance.toFixed(1)}km` : '-'}</span>
                    <strong style={{ color: isQpso ? '#10b981' : '#f8fafc' }}>
                      Fit: {c.best_fitness ? c.best_fitness.toFixed(1) : '-'}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── OTP Delivery Verification Table (Admin Real-Time Monitoring) ── */}
      {otpRows && otpRows.length > 0 && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '14px',
          marginTop: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>🔐</span> Delivery OTP Verification Table
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '6px',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}>
              {otpRows.filter(r => r.otp_status === 'Verified').length}/{otpRows.length} Verified
            </span>
          </div>

          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px', lineHeight: '1.4' }}>
            Live OTP status per customer stop. <em>(Actual 6-digit OTP codes are encrypted & strictly hidden from Admin/Driver view).</em>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
            {otpRows.map((row, rIdx) => {
              const isVerified = row.otp_status === 'Verified';
              const isExpired = row.otp_status === 'Expired';
              const otpBg = isVerified ? 'rgba(16, 185, 129, 0.15)' : isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)';
              const otpColor = isVerified ? '#34d399' : isExpired ? '#f87171' : '#60a5fa';
              const otpBorder = isVerified ? '#10b981' : isExpired ? '#ef4444' : '#3b82f6';

              return (
                <div
                  key={row.delivery_id || rIdx}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
                      {row.stop_name || row.delivery_id}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: otpBg,
                      color: otpColor,
                      border: `1px solid ${otpBorder}`
                    }}>
                      {isVerified ? '✓ Verified' : isExpired ? '⏰ Expired' : '🔐 Active OTP'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Customer: <strong style={{ color: '#cbd5e1' }}>{row.customer_name}</strong></span>
                    <span>Driver: <strong style={{ color: '#cbd5e1' }}>{row.driver_name || 'Unassigned'}</strong></span>
                  </div>

                  {/* Customer Token & Tracking Link Quick Action */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    background: 'rgba(0,0,0,0.25)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: '#94a3b8'
                  }}>
                    <span>Token: <strong style={{ color: '#38bdf8' }}>{row.customer_token || row.delivery_id}</strong></span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(row.customer_token || row.delivery_id);
                          alert(`Copied Delivery Token: ${row.customer_token || row.delivery_id}`);
                        }}
                        style={{
                          background: '#1e293b',
                          border: '1px solid #334155',
                          color: '#e2e8f0',
                          borderRadius: '3px',
                          padding: '2px 5px',
                          fontSize: '9px',
                          cursor: 'pointer'
                        }}
                      >
                        Copy Token
                      </button>
                      <a
                        href={`http://localhost:3000?customer=${row.customer_token || row.delivery_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: '#2563eb',
                          color: '#ffffff',
                          borderRadius: '3px',
                          padding: '2px 6px',
                          fontSize: '9px',
                          textDecoration: 'none',
                          fontWeight: '600'
                        }}
                      >
                        Open Track ➔
                      </a>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#64748b' }}>
                    <span>Status: <strong style={{ color: row.delivery_status === 'Delivered' ? '#34d399' : '#fbbf24' }}>{row.delivery_status}</strong></span>
                    <span>Attempts: {row.otp_attempts || 0}/5 {row.verified_at ? `· Verified at ${row.verified_at}` : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
