import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Truck, Navigation, CheckCircle2, Clock, AlertTriangle,
  LogOut, MapPin, ExternalLink, RefreshCw, ChevronRight,
  Shield, Package, AlertCircle, ArrowRight, Check, Sparkles,
  Layers, Compass, ArrowUpRight, XCircle, X, FileText, RotateCcw, KeyRound
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getDriverView, acceptJob, completeDelivery, failDelivery, completeReturnToHub, releaseDriver } from '../services/api';
import { useGeolocation } from '../hooks/useGeolocation';
import OTPVerifyModal from './OTPVerifyModal';

// Map auto-centering component
function RecenterOnDriver({ center, zoom = 13 }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

// Custom Numbered Marker Icon Builder
function createStopIcon(label, status) {
  let bgColor = '#3b82f6';
  let borderColor = '#93c5fd';
  let badgeSymbol = '';

  if (status === 'In Progress') {
    bgColor = '#f59e0b';
    borderColor = '#fde68a';
  } else if (status === 'Delivered') {
    bgColor = '#10b981';
    borderColor = '#a7f3d0';
    badgeSymbol = '✓';
  } else if (status === 'Failed') {
    bgColor = '#ef4444';
    borderColor = '#fca5a5';
    badgeSymbol = '✕';
  }


  const html = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: ${bgColor};
      border: 2.5px solid ${borderColor};
      border-radius: 50%;
      color: #ffffff;
      font-weight: 800;
      font-size: 13px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      cursor: pointer;
      font-family: sans-serif;
    ">
      ${badgeSymbol || label}
    </div>
  `;

  return L.divIcon({
    className: 'custom-driver-stop-marker',
    html: html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });
}

function createDepotIcon() {
  const html = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      background: #4f46e5;
      border: 2.5px solid #c7d2fe;
      border-radius: 8px;
      color: #ffffff;
      font-weight: 800;
      font-size: 15px;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.6);
      cursor: pointer;
    ">
      🏢
    </div>
  `;
  return L.divIcon({
    className: 'custom-driver-depot-marker',
    html: html,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
}

export default function DriverDashboard({ user, onLogout }) {
  const driverId = user?.driver_id || 'driver1';
  const driverName = user?.name || 'Driver 1';
  const assignedVehicle = user?.assigned_vehicle || 'Vehicle 1';

  // Live GPS tracking
  const { coords: userGps } = useGeolocation('delhi');

  // View state: 'jobs' (Available Jobs) or 'route' (Active Delivery Cockpit)
  const [activeTab, setActiveTab] = useState('jobs');
  const [driverView, setDriverView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acceptingJobId, setAcceptingJobId] = useState(null);
  const [completingStopId, setCompletingStopId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Failure Modal state
  const [failModalStop, setFailModalStop] = useState(null);
  const [failReason, setFailReason] = useState('Customer unavailable / Not home');
  const [failCustomNotes, setFailCustomNotes] = useState('');
  const [failingStopId, setFailingStopId] = useState(null);

  // OTP Verification Modal state
  const [otpModalStop, setOtpModalStop] = useState(null);

  // Return-to-hub confirmation states
  const [completingReturn, setCompletingReturn] = useState(false);
  const [returnSubmitted, setReturnSubmitted] = useState(false);
  const [releasingDriver, setReleasingDriver] = useState(false);

  // Track previous status to detect when Admin verifies and releases driver
  const prevJobStatusRef = useRef(null);

  // Fetch full driver view
  const fetchDriverData = useCallback(async () => {
    try {
      const res = await getDriverView(driverId);
      const data = res.data;
      setDriverView(data);

      const wasAwaitingVerification =
        prevJobStatusRef.current === 'Pending Admin Verification' ||
        prevJobStatusRef.current === 'Returning to Hub' ||
        returnSubmitted;

      // Detect if Admin just verified and released the driver:
      // Driver transitioned to 'Available' and has no active job
      if (wasAwaitingVerification && data.driver?.status === 'Available' && !data.has_active_job) {
        setReturnSubmitted(false);
        setActiveTab('jobs');
        setSuccessMessage('✅ Returned deliverables verified & checked in by Admin. You are now released to claim new jobs!');
        setTimeout(() => setSuccessMessage(null), 6000);
      } else if (data.has_active_job && data.current_job?.status !== 'Completed') {
        // If driver has an active job, automatically switch to route cockpit
        setActiveTab('route');
      } else if (!data.has_active_job && data.driver?.status === 'Available' && activeTab === 'route' && !data.current_job) {
        // If driver has no job, is Available, and is currently on route tab, send to jobs page
        setActiveTab('jobs');
      }

      prevJobStatusRef.current = data.current_job?.status || null;
    } catch (err) {
      console.error('Failed to load driver data:', err);
      setErrorMessage(err.response?.data?.detail || 'Unable to connect to dispatch server.');
    } finally {
      setLoading(false);
    }
  }, [driverId, returnSubmitted, activeTab]);

  useEffect(() => {
    fetchDriverData();
    // Poll faster (every 3s) when awaiting admin verification so driver is released immediately
    const isWaiting = returnSubmitted || driverView?.current_job?.status === 'Pending Admin Verification';
    const intervalTime = isWaiting ? 3000 : 8000;
    const interval = setInterval(fetchDriverData, intervalTime);
    return () => clearInterval(interval);
  }, [fetchDriverData, returnSubmitted, driverView?.current_job?.status]);

  // Handle Accept Job
  const handleAcceptJob = async (jobId) => {
    setAcceptingJobId(jobId);
    setErrorMessage(null);
    try {
      const gpsPayload = userGps?.lat ? { lat: userGps.lat, lng: userGps.lng } : { lat: 28.6139, lng: 77.2090 };
      const res = await acceptJob(driverId, jobId, gpsPayload);
      if (res.data.success) {
        setSuccessMessage(`Job ${jobId} accepted! QPSO route calculated starting from Central Hub.`);
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchDriverData();
        setActiveTab('route');
      }
    } catch (err) {
      console.error('Error accepting job:', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to accept job. It may have already been claimed.');
    } finally {
      setAcceptingJobId(null);
    }
  };

  // Handle Complete Delivery
  const handleCompleteDelivery = async (stopId) => {
    if (!driverView?.current_job) return;
    setCompletingStopId(stopId);
    setErrorMessage(null);
    try {
      const gpsPayload = userGps?.lat ? { lat: userGps.lat, lng: userGps.lng } : { lat: 28.6139, lng: 77.2090 };
      const res = await completeDelivery(driverId, driverView.current_job.job_id, stopId, gpsPayload);
      if (res.data.success) {
        setSuccessMessage(`Stop marked as Delivered! Remaining route re-optimized with current traffic.`);
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchDriverData();
      }
    } catch (err) {
      console.error('Error completing delivery:', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to complete delivery.');
    } finally {
      setCompletingStopId(null);
    }
  };

  // Handle Not Delivered / Failed Delivery
  const handleFailDelivery = async () => {
    if (!failModalStop || !driverView?.current_job) return;
    setFailingStopId(failModalStop.id);
    setErrorMessage(null);
    try {
      const gpsPayload = userGps?.lat ? { lat: userGps.lat, lng: userGps.lng } : { lat: 28.6139, lng: 77.2090 };
      const fullReason = (failReason === 'Other' && failCustomNotes.trim())
        ? `Other: ${failCustomNotes.trim()}`
        : (failCustomNotes.trim() ? `${failReason} - ${failCustomNotes.trim()}` : failReason);

      const res = await failDelivery(driverId, driverView.current_job.job_id, failModalStop.id, fullReason, gpsPayload);
      if (res.data.success) {
        setSuccessMessage(`Delivery marked as Not Delivered: "${fullReason}". Route re-optimized.`);
        setTimeout(() => setSuccessMessage(null), 5000);
        setFailModalStop(null);
        setFailCustomNotes('');
        await fetchDriverData();
      }
    } catch (err) {
      console.error('Error reporting failed delivery:', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to update delivery status.');
    } finally {
      setFailingStopId(null);
    }
  };

  // Handle driver confirming arrival at hub with undelivered items
  const handleCompleteReturn = async () => {
    if (!driverView?.current_job) return;
    setCompletingReturn(true);
    setErrorMessage(null);
    try {
      const gpsPayload = userGps?.lat ? { lat: userGps.lat, lng: userGps.lng } : { lat: 28.6139, lng: 77.2090 };
      const res = await completeReturnToHub(driverId, driverView.current_job.job_id, gpsPayload);
      if (res.data.success) {
        setReturnSubmitted(true);
        setSuccessMessage('Hub return confirmed. Awaiting admin verification of undelivered items.');
        setTimeout(() => setSuccessMessage(null), 6000);
        await fetchDriverData();
      }
    } catch (err) {
      console.error('Error confirming hub return:', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to confirm hub return.');
    } finally {
      setCompletingReturn(false);
    }
  };

  // Handle claiming another job: release driver on backend, sync admin dashboard, and switch to available jobs
  const handleClaimAnotherJob = async () => {
    setReleasingDriver(true);
    setErrorMessage(null);
    try {
      await releaseDriver(driverId);
      setReturnSubmitted(false);
      await fetchDriverData();
      setActiveTab('jobs');
      setSuccessMessage('You have been released and are now available to claim a new job.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('Error releasing driver:', err);
      setActiveTab('jobs');
      await fetchDriverData();
    } finally {
      setReleasingDriver(false);
    }
  };

  const currentJob = driverView?.current_job;
  const activeRoute = currentJob?.route;
  const availableJobs = driverView?.available_jobs || [];
  const stops = currentJob?.delivery_points || [];
  const pendingStops = stops.filter(s => s.status === 'Pending' || s.status === 'In Progress');
  const deliveredStops = stops.filter(s => s.status === 'Delivered');
  const failedStops = stops.filter(s => s.status === 'Failed');
  const remainingStops = pendingStops;
  const isReturningToHub = Boolean(activeRoute?.returning_to_hub || (pendingStops.length === 0 && failedStops.length > 0));

  // Next stop calculation
  const nextStop = isReturningToHub
    ? { name: 'Central Distribution Hub (Depot)', label: 'HUB', lat: 28.6139, lng: 77.2090 }
    : (activeRoute?.stats?.next_stop || remainingStops[0] || null);


  // Polyline for map — normalize to [[lat, lng], ...] for Leaflet compatibility
  const polylineCoords = (activeRoute?.polyline || []).map(p =>
    Array.isArray(p) ? [p[0], p[1]] : [p.lat, p.lng]
  );


  // Center position for map
  const mapCenter = userGps?.lat
    ? [userGps.lat, userGps.lng]
    : nextStop
      ? [nextStop.lat, nextStop.lng]
      : [28.6139, 77.2090];

  const googleMapsUrl = activeRoute?.google_maps_url || '';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: '#090d16',
      color: '#f1f5f9',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      {/* ── Driver Header ── */}
      <header style={{
        backgroundColor: '#111827',
        borderBottom: '1px solid #1f2937',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0d9488, #06b6d4)',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(13, 148, 136, 0.35)'
          }}>
            <Truck size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc' }}>
                Driver Portal
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: 'rgba(14, 165, 233, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(14, 165, 233, 0.3)'
              }}>
                {assignedVehicle}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Operator: <strong>{driverName}</strong> ({driverId})</span>
              <span>•</span>
              <span style={{ color: driverView?.driver?.status === 'En Route' ? '#38bdf8' : '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  backgroundColor: driverView?.driver?.status === 'En Route' ? '#38bdf8' : '#10b981',
                  display: 'inline-block'
                }} />
                Status: {driverView?.driver?.status || 'Available'}
              </span>
            </div>
          </div>
        </div>

        {/* View Navigation Tabs & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            padding: '3px',
            border: '1px solid #334155'
          }}>
            <button
              onClick={() => setActiveTab('jobs')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === 'jobs' ? '#2563eb' : 'transparent',
                color: activeTab === 'jobs' ? '#ffffff' : '#94a3b8',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Package size={14} />
              <span>Available Jobs ({availableJobs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('route')}
              disabled={!currentJob}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === 'route' ? '#0d9488' : 'transparent',
                color: activeTab === 'route' ? '#ffffff' : currentJob ? '#94a3b8' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: currentJob ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease'
              }}
            >
              <Navigation size={14} />
              <span>Active Route Cockpit</span>
              {currentJob && currentJob.status !== 'Completed' && (
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  backgroundColor: '#38bdf8', display: 'inline-block'
                }} />
              )}
            </button>
          </div>

          <button
            onClick={fetchDriverData}
            title="Refresh Dispatch State"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              color: '#94a3b8',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} />
          </button>

          <button
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              backgroundColor: '#374151',
              border: '1px solid #4b5563',
              color: '#e5e7eb',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Alerts ── */}
      {errorMessage && (
        <div style={{
          margin: '12px 24px 0 24px',
          padding: '10px 14px',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#f87171',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div style={{
          margin: '12px 24px 0 24px',
          padding: '10px 14px',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          color: '#34d399',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* ── TAB 1: AVAILABLE DELIVERY JOBS ── */}
      {activeTab === 'jobs' && (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc', margin: '0 0 4px 0' }}>
              Available Delivery Jobs
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Select a delivery batch to accept. Route will immediately optimize from your current GPS position via QPSO.
            </p>
          </div>

          {availableJobs.length === 0 ? (
            <div style={{
              backgroundColor: '#111827',
              borderRadius: '12px',
              border: '1px solid #1f2937',
              padding: '60px 20px',
              textAlign: 'center',
              color: '#64748b'
            }}>
              <Package size={48} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginBottom: '6px' }}>
                No Available Jobs at the Moment
              </div>
              <div style={{ fontSize: '13px' }}>
                All delivery batches have been accepted by drivers. Check back shortly or request Admin to publish new routes.
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '18px'
            }}>
              {availableJobs.map((job) => {
                const isAccepting = acceptingJobId === job.job_id;
                return (
                  <div
                    key={job.job_id}
                    style={{
                      backgroundColor: '#111827',
                      borderRadius: '12px',
                      border: '1px solid #1f2937',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      transition: 'transform 0.15s ease, border-color 0.15s ease'
                    }}
                  >
                    {/* Card Header: Job ID & Priority */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          backgroundColor: '#1e293b',
                          color: '#38bdf8',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '700',
                          border: '1px solid #334155'
                        }}>
                          {job.job_id}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {job.created_at}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        backgroundColor: job.priority === 'High Priority' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: job.priority === 'High Priority' ? '#f87171' : '#60a5fa',
                        border: `1px solid ${job.priority === 'High Priority' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
                      }}>
                        {job.priority}
                      </span>
                    </div>

                    {/* Job Title */}
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', margin: '0 0 12px 0' }}>
                      {job.title}
                    </h3>

                    {/* Metrics Bar */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      backgroundColor: '#0b1120',
                      borderRadius: '8px',
                      padding: '10px',
                      marginBottom: '14px',
                      border: '1px solid #1e293b'
                    }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>STOPS</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc' }}>
                          {job.num_deliveries}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>DISTANCE</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#38bdf8' }}>
                          {job.total_distance_km} km
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>EST. TIME</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#a78bfa' }}>
                          {Math.round(job.estimated_time_min)} min
                        </div>
                      </div>
                    </div>

                    {/* Traffic condition */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: job.traffic_color || '#10b981',
                      marginBottom: '14px'
                    }}>
                      <span style={{
                        width: '7px', height: '7px', borderRadius: '50%',
                        backgroundColor: job.traffic_color || '#10b981'
                      }} />
                      <span>Traffic: <strong>{job.traffic_condition}</strong></span>
                    </div>

                    {/* List of Delivery Destinations */}
                    <div style={{ flex: 1, marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Delivery Locations:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {job.delivery_points.map((pt, pIdx) => (
                          <div
                            key={pt.id || pIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '12px',
                              backgroundColor: 'rgba(30, 41, 59, 0.5)',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255, 255, 255, 0.04)'
                            }}
                          >
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              backgroundColor: '#2563eb',
                              color: '#ffffff',
                              fontSize: '10px',
                              fontWeight: '700'
                            }}>
                              {pt.label || `D${pIdx+1}`}
                            </span>
                            <span style={{ flex: 1, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {pt.name}
                            </span>
                            <span style={{ color: '#64748b', fontSize: '11px' }}>
                              {pt.demand}kg
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Accept Job Button */}
                    <button
                      type="button"
                      disabled={isAccepting}
                      onClick={() => handleAcceptJob(job.job_id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '11px 16px',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: isAccepting ? 'not-allowed' : 'pointer',
                        opacity: isAccepting ? 0.7 : 1,
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      {isAccepting ? (
                        <span>Calculating Optimal Route…</span>
                      ) : (
                        <>
                          <span>Accept Job & Start Routing</span>
                          <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: ACTIVE DELIVERY COCKPIT ── */}
      {activeTab === 'route' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top Live Progress KPI Bar */}
          <div style={{
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            padding: '10px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px'
          }}>
            <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '10px 14px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>ACTIVE JOB</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#38bdf8', marginTop: '2px' }}>
                {currentJob?.job_id || 'No Job Active'}
              </div>
            </div>

            <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '10px 14px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>COMPLETION PROGRESS</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#10b981', marginTop: '2px' }}>
                {deliveredStops.length} / {stops.length} Stops Delivered
              </div>
            </div>

            <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '10px 14px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>REMAINING DISTANCE</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', marginTop: '2px' }}>
                {activeRoute?.total_distance_km ? `${activeRoute.total_distance_km.toFixed(1)} km` : '0 km'}
              </div>
            </div>

            <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '10px 14px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>REMAINING TIME (TRAFFIC-AWARE)</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#a78bfa', marginTop: '2px' }}>
                {activeRoute?.total_time_min ? `${Math.round(activeRoute.total_time_min)} min` : '0 min'}
              </div>
            </div>
          </div>

          {/* Optimized Delivery Sequence Banner */}
          {activeRoute?.sequence_str && (
            <div style={{
              backgroundColor: '#131d31',
              borderBottom: '1px solid #1f2937',
              padding: '8px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '12px'
            }}>
              <span style={{ color: '#38bdf8', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Compass size={14} />
                QPSO Optimal Sequence:
              </span>
              <span style={{
                color: '#f8fafc',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(0,0,0,0.3)',
                padding: '3px 8px',
                borderRadius: '4px'
              }}>
                Driver GPS ➔ {activeRoute.sequence_str}
              </span>
              <span style={{ marginLeft: 'auto', color: activeRoute.traffic_color || '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: activeRoute.traffic_color || '#10b981' }} />
                {activeRoute.traffic_condition || 'Low Traffic'}
              </span>
            </div>
          )}

          {/* Split View: Left List, Right Map */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: Stop Cards */}
            <div style={{
              width: '430px',
              backgroundColor: '#111827',
              borderRight: '1px solid #1f2937',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflowY: 'auto'
            }}>
              {/* Return to Hub Banner when undelivered items need return */}
              {isReturningToHub && (
                <div style={{
                  margin: '14px',
                  padding: '18px 16px',
                  backgroundColor: 'rgba(139, 92, 246, 0.14)',
                  border: '1.5px solid rgba(139, 92, 246, 0.45)',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: '#8b5cf6',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px auto',
                    fontSize: '20px'
                  }}>
                    🏢
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#c4b5fd', margin: '0 0 4px 0' }}>
                    Final Leg: Return to Central Hub
                  </h3>
                  <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '0 0 12px 0' }}>
                    Deliveries completed. <strong>{failedStops.length} undelivered item(s)</strong> must be returned to Central Hub.
                  </p>
                   {googleMapsUrl && !returnSubmitted && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        backgroundColor: '#8b5cf6',
                        color: '#ffffff',
                        textDecoration: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '700'
                      }}
                    >
                      <Navigation size={13} />
                      <span>Navigate Back to Hub</span>
                      <ExternalLink size={12} />
                    </a>
                  )}

                  {/* Confirm Arrived / Pending Verification */}
                  <div style={{ marginTop: '12px' }}>
                    {returnSubmitted || currentJob?.status === 'Pending Admin Verification' ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 14px',
                        backgroundColor: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        borderRadius: '8px',
                        fontSize: '12px', color: '#fbbf24', fontWeight: '600'
                      }}>
                        <span>⏳</span>
                        <span>Arrived at Hub — Awaiting Admin Verification of returned items</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleCompleteReturn}
                        disabled={completingReturn}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          backgroundColor: completingReturn ? '#334155' : '#059669',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: '700',
                          cursor: completingReturn ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'background-color 0.2s'
                        }}
                      >
                        <CheckCircle2 size={16} />
                        {completingReturn ? 'Submitting...' : '✓ Confirm Arrived at Hub'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Job Completed All-Delivered Celebration Card */}
              {!isReturningToHub && remainingStops.length === 0 && stops.length > 0 && (
                <div style={{
                  margin: '16px',
                  padding: '24px 20px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px auto'
                  }}>
                    <Check size={28} />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#34d399', margin: '0 0 6px 0' }}>
                    Job Completed!
                  </h3>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
                    All {stops.length} deliveries in {currentJob?.job_id} have been completed successfully. Admin dashboard updated.
                  </p>
                  <button
                    onClick={handleClaimAnotherJob}
                    disabled={releasingDriver}
                    style={{
                      padding: '10px 18px',
                      backgroundColor: releasingDriver ? '#334155' : '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: releasingDriver ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {releasingDriver ? 'Releasing Driver...' : 'Claim Another Job ➔'}
                  </button>
                </div>
              )}

              {/* Stop Cards */}
              <div style={{ padding: '12px', flex: 1 }}>

                {/* ── Hub Origin Card (Stop 0) ─────────────────────── */}
                {stops.length > 0 && currentJob?.depot && (
                  <div style={{
                    backgroundColor: '#0d1729',
                    borderRadius: '10px',
                    border: '1.5px solid #4f46e5',
                    padding: '14px',
                    marginBottom: '10px',
                    boxShadow: '0 0 12px rgba(79,70,229,0.18)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          backgroundColor: '#4f46e5', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '14px', fontWeight: '800', flexShrink: 0
                        }}>🏢</div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#818cf8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Origin · Stop 0
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#c7d2fe' }}>
                            Central Distribution Hub
                          </div>
                        </div>
                      </div>
                      <span style={{
                        fontSize: '10px', fontWeight: '700', color: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.15)',
                        padding: '3px 8px', borderRadius: '10px',
                        border: '1px solid rgba(16,185,129,0.3)'
                      }}>
                        Trip Started ✓
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={11} />
                      {currentJob.depot.name || 'Central Distribution Hub'} &nbsp;·&nbsp;
                      {currentJob.depot.lat?.toFixed(4)}, {currentJob.depot.lng?.toFixed(4)}
                    </div>
                  </div>
                )}

                {stops.map((stop, index) => {
                  const isDelivered = stop.status === 'Delivered';
                  const isFailed = stop.status === 'Failed';
                  const isCompleting = completingStopId === stop.id;
                  const isFailing = failingStopId === stop.id;
                  const isNext = !isDelivered && !isFailed && nextStop?.id === stop.id;

                  const googleStopUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;

                  let cardBg = '#1e293b';
                  let cardBorder = '#334155';
                  if (isDelivered) {
                    cardBg = '#0d181e';
                    cardBorder = '#065f46';
                  } else if (isFailed) {
                    cardBg = 'rgba(239, 68, 68, 0.08)';
                    cardBorder = 'rgba(239, 68, 68, 0.35)';
                  } else if (isNext) {
                    cardBg = '#132338';
                    cardBorder = '#2563eb';
                  }

                  return (
                    <div
                      key={stop.id || index}
                      style={{
                        backgroundColor: cardBg,
                        borderRadius: '10px',
                        border: '1px solid',
                        borderColor: cardBorder,
                        padding: '14px',
                        marginBottom: '10px',
                        position: 'relative',
                        boxShadow: isNext ? '0 0 14px rgba(37, 99, 235, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Stop Top Line */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            backgroundColor: isDelivered ? '#10b981' : isFailed ? '#ef4444' : isNext ? '#2563eb' : '#475569',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: '800'
                          }}>
                            {isDelivered ? '✓' : isFailed ? '✕' : stop.label || `D${index+1}`}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: isFailed ? '#fca5a5' : isNext ? '#38bdf8' : '#f8fafc' }}>
                            {stop.label || `D${index+1}`}: {stop.name}
                          </span>
                        </div>

                        <span style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: isDelivered
                            ? 'rgba(16, 185, 129, 0.2)'
                            : isFailed
                              ? 'rgba(239, 68, 68, 0.2)'
                              : 'rgba(59, 130, 246, 0.2)',
                          color: isDelivered
                            ? '#34d399'
                            : isFailed
                              ? '#f87171'
                              : '#60a5fa',
                          border: `1px solid ${isDelivered ? '#10b981' : isFailed ? '#ef4444' : '#3b82f6'}`
                        }}>
                          {isFailed ? 'Not Delivered' : (stop.status || 'Pending')}
                        </span>
                      </div>

                      {/* Demand & Details */}
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        <span>Demand: <strong>{stop.demand} kg</strong></span>
                        {stop.delivered_at && <span>Delivered: <strong style={{ color: '#34d399' }}>{stop.delivered_at}</strong></span>}
                        {stop.failed_at && <span>Reported: <strong style={{ color: '#f87171' }}>{stop.failed_at}</strong></span>}
                      </div>

                      {/* Failure Reason Callout */}
                      {isFailed && (
                        <div style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          marginBottom: '10px',
                          fontSize: '11px',
                          color: '#fca5a5'
                        }}>
                          <div style={{ fontWeight: '700', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertCircle size={13} />
                            Reason: {stop.failed_reason || 'Undelivered'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#e2e8f0', opacity: 0.85 }}>
                            📦 Undelivered package will be returned to Central Hub at end of shift.
                          </div>
                        </div>
                      )}

                      {/* Action Row */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255,255,255,0.06)'
                      }}>
                        {/* Status Buttons / Labels */}
                        {isDelivered ? (
                          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={14} /> Completed & Removed from Route
                          </span>
                        ) : isFailed ? (
                          <span style={{ fontSize: '12px', color: '#f87171', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RotateCcw size={13} /> Return to Hub Scheduled
                          </span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {/* Verify OTP Button */}
                            <button
                              type="button"
                              disabled={isCompleting || isFailing}
                              onClick={() => setOtpModalStop(stop)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '6px 11px',
                                backgroundColor: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: (isCompleting || isFailing) ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)'
                              }}
                            >
                              <KeyRound size={12} />
                              <span>Verify OTP</span>
                            </button>

                            {/* Mark Delivered Button */}
                            <button
                              type="button"
                              disabled={isCompleting || isFailing}
                              onClick={() => handleCompleteDelivery(stop.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '6px 11px',
                                backgroundColor: '#059669',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: (isCompleting || isFailing) ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
                              }}
                            >
                              <CheckCircle2 size={12} />
                              <span>{isCompleting ? 'Updating…' : 'Quick Deliver'}</span>
                            </button>

                            {/* Not Delivered Button */}
                            <button
                              type="button"
                              disabled={isCompleting || isFailing}
                              onClick={() => {
                                setFailModalStop(stop);
                                setFailReason('Customer unavailable / Not home');
                                setFailCustomNotes('');
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '6px 9px',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.45)',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: (isCompleting || isFailing) ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <XCircle size={12} />
                              <span>Not Delivered</span>
                            </button>
                          </div>
                        )}

                        {/* Google Maps Turn-by-Turn Link */}
                        <a
                          href={googleStopUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            color: '#38bdf8',
                            textDecoration: 'none',
                            fontWeight: '600',
                            padding: '5px 9px',
                            borderRadius: '5px',
                            backgroundColor: 'rgba(56, 189, 248, 0.1)',
                            border: '1px solid rgba(56, 189, 248, 0.25)'
                          }}
                        >
                          <Navigation size={11} />
                          <span>Navigate</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>


            {/* Right: Driver Dedicated Map */}
            <div style={{ flex: 1, height: '100%', position: 'relative' }}>
              {/* Google Maps Live Route Overlay */}
              {googleMapsUrl && (
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  left: '60px',
                  zIndex: 1000,
                  backgroundColor: 'rgba(15, 23, 42, 0.94)',
                  backdropFilter: 'blur(8px)',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: '500' }}>
                    🚦 Google Traffic-Aware Route: <strong>{currentJob?.job_id}</strong>
                  </span>
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '700',
                      textDecoration: 'none'
                    }}
                  >
                    <span>Open Live Route in Google Maps</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

              <MapContainer
                center={mapCenter}
                zoom={13}
                style={{ width: '100%', height: '100%', backgroundColor: '#090d16' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <RecenterOnDriver center={mapCenter} />

                {/* Driver Live GPS Marker */}
                {userGps?.lat && userGps?.lng && (
                  <CircleMarker
                    center={[userGps.lat, userGps.lng]}
                    radius={9}
                    pathOptions={{
                      fillColor: '#38bdf8',
                      fillOpacity: 1,
                      color: '#ffffff',
                      weight: 3
                    }}
                  >
                    <Popup>
                      <div style={{ color: '#000', fontSize: '12px' }}>
                        <strong>📍 Your Current GPS Location</strong><br />
                        Lat: {userGps.lat.toFixed(4)}, Lng: {userGps.lng.toFixed(4)}
                      </div>
                    </Popup>
                  </CircleMarker>
                )}

                {/* Central Hub / Depot Marker */}
                {currentJob?.depot && (
                  <Marker
                    position={[currentJob.depot.lat, currentJob.depot.lng]}
                    icon={createDepotIcon()}
                  >
                    <Popup>
                      <div style={{ color: '#0f172a', fontSize: '12px' }}>
                        <strong>🏢 Central Distribution Hub (Depot)</strong><br />
                        {currentJob.depot.name}<br />
                        <span style={{ color: '#4f46e5', fontWeight: 'bold' }}>Route Origin & Undelivered Goods Return Point</span>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Stops Markers */}
                {stops.map((stop, i) => (
                  <Marker
                    key={stop.id || i}
                    position={[stop.lat, stop.lng]}
                    icon={createStopIcon(stop.label || `D${i+1}`, stop.status)}
                  >
                    <Popup>
                      <div style={{ color: '#0f172a', fontSize: '12px', minWidth: '180px' }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '4px' }}>
                          {stop.label || `D${i+1}`}: {stop.name}
                        </div>
                        <div>Status: <strong style={{ color: stop.status === 'Failed' ? '#ef4444' : stop.status === 'Delivered' ? '#10b981' : '#3b82f6' }}>{stop.status === 'Failed' ? 'Not Delivered' : (stop.status || 'Pending')}</strong></div>
                        {stop.failed_reason && (
                          <div style={{ color: '#dc2626', marginTop: '4px', fontSize: '11px' }}>
                            <strong>Reason:</strong> {stop.failed_reason}
                          </div>
                        )}
                        <div>Demand: {stop.demand} kg</div>
                        <div style={{ marginTop: '8px' }}>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#2563eb', fontWeight: '600', textDecoration: 'none' }}
                          >
                            Navigate in Google Maps ➔
                          </a>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Remaining Route Polyline */}
                {polylineCoords.length > 1 && (
                  <>
                    <Polyline
                      positions={polylineCoords}
                      pathOptions={{
                        color: activeRoute?.traffic_color || '#3b82f6',
                        weight: 8,
                        opacity: 0.35,
                        lineCap: 'round',
                        lineJoin: 'round'
                      }}
                    />
                    <Polyline
                      positions={polylineCoords}
                      pathOptions={{
                        color: activeRoute?.traffic_color || '#3b82f6',
                        weight: 4,
                        opacity: 0.95,
                        lineCap: 'round',
                        lineJoin: 'round'
                      }}
                    />
                  </>
                )}
              </MapContainer>
            </div>
          </div>
        </div>
      )}

      {/* Undelivered Package Modal */}
      {failModalStop && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.78)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '14px',
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            position: 'relative'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}>✕</span>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#f8fafc' }}>
                    Report Undelivered Package
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 36px', fontSize: '12px', color: '#94a3b8' }}>
                  {failModalStop.label}: {failModalStop.name}
                </p>
              </div>
              <button
                onClick={() => { setFailModalStop(null); setFailCustomNotes(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Info notice */}
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#fca5a5',
              lineHeight: 1.4
            }}>
              ⚠️ <strong>Notice:</strong> This reason will appear in the <strong>Admin Dashboard</strong> with delivery status in real time. The route will re-optimize for remaining stops, and your final stop will be back to the <strong>Central Hub</strong> to return undelivered goods.
            </div>

            {/* Reason selector */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                Select Reason for Failed Delivery:
              </label>
              <select
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none'
                }}
              >
                <option value="Customer unavailable / Not home">Customer unavailable / Not home</option>
                <option value="Address incorrect / Cannot locate premise">Address incorrect / Cannot locate premise</option>
                <option value="Customer refused delivery / Cancelled order">Customer refused delivery / Cancelled order</option>
                <option value="Access restricted / Gate locked">Access restricted / Gate locked</option>
                <option value="Package damaged in transit">Package damaged in transit</option>
                <option value="Payment / OTP verification failed">Payment / OTP verification failed</option>
                <option value="Business closed / Outside delivery hours">Business closed / Outside delivery hours</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Optional notes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                Additional Driver Remarks / Reason Details:
              </label>
              <textarea
                rows={3}
                value={failCustomNotes}
                onChange={(e) => setFailCustomNotes(e.target.value)}
                placeholder="E.g., Called recipient twice, gatekeeper stated recipient out of town until tomorrow."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => { setFailModalStop(null); setFailCustomNotes(''); }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#334155',
                  color: '#e2e8f0',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={failingStopId !== null}
                onClick={handleFailDelivery}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: failingStopId !== null ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)'
                }}
              >
                {failingStopId !== null ? (
                  <span>Re-optimizing Route…</span>
                ) : (
                  <>
                    <XCircle size={15} />
                    <span>Confirm Not Delivered</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OTP Verification Modal ── */}
      {otpModalStop && (
        <OTPVerifyModal
          stop={otpModalStop}
          driverId={driverId}
          driverGps={userGps?.lat ? { lat: userGps.lat, lng: userGps.lng } : { lat: 28.6139, lng: 77.2090 }}
          onSuccess={(data) => {
            setOtpModalStop(null);
            setSuccessMessage(`✅ OTP Verified! Stop marked as Delivered & remaining route re-optimized.`);
            setTimeout(() => setSuccessMessage(null), 5000);
            fetchDriverData();
          }}
          onCancel={() => setOtpModalStop(null)}
        />
      )}
    </div>
  );
}
