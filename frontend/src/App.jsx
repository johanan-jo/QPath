import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { optimizeRealRoute, compareRealRoute, getMe, getAdminFleetLive } from './services/api';
import { useGeolocation } from './hooks/useGeolocation';
import { useTraffic } from './hooks/useTraffic';

import MapView from './components/MapView';
import VehicleDetailsPanel from './components/VehicleDetailsPanel';
import DeliveryModal from './components/DeliveryModal';
import ComparisonPage from './components/ComparisonPage';
import NotificationToast from './components/NotificationToast';
import TrafficLegend from './components/TrafficLegend';
import LoginPage from './components/LoginPage';
import DriverDashboard from './components/DriverDashboard';
import CustomerDashboard from './components/CustomerDashboard';

/* ─────────────────────────────────────────
   Default routing parameters
───────────────────────────────────────── */
const DEFAULT_PARAMS = {
  numVehicles: 1,
  vehicleCapacity: 100,
  weights: { w1: 0.35, w2: 0.25, w3: 0.25, w4: 0.15 },
  numParticles: 30,
  maxIterations: 80,
  selectedAlgorithm: 'qpso',
};

const DEFAULT_DELIVERY_POINTS = [
  { id: 'd1', name: 'India Gate, New Delhi',          lat: 28.6129, lng: 77.2295, demand: 15.0 },
  { id: 'd2', name: 'AIIMS Hospital, Ansari Nagar',   lat: 28.5672, lng: 77.2100, demand: 20.0 },
  { id: 'd3', name: 'Karol Bagh Market',              lat: 28.6517, lng: 77.1906, demand: 12.0 },
  { id: 'd4', name: 'Lajpat Nagar Central Market',    lat: 28.5700, lng: 77.2400, demand: 18.0 },
];

/* ─────────────────────────────────────────
   Root Application
───────────────────────────────────────── */
export default function App() {
  /* ── Customer Portal Direct Link Token (e.g. ?customer=TOKEN or ?token=TOKEN) ── */
  const [customerToken, setCustomerToken] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('customer') || params.get('token') || params.get('track') || null;
    } catch {
      return null;
    }
  });

  /* ── Authentication & Role Session ── */
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('qpath_auth_token'));
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('qpath_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  /* ── Live Fleet State for Admin ── */
  const [fleetLive, setFleetLive] = useState(null);

  /* ── Page navigation ── */
  const [appPage, setAppPage] = useState('operations'); // 'operations' | 'comparison'

  /* ── GPS depot ── */
  const { coords: userGps, status: geoStatus, requestLocation } = useGeolocation('delhi');
  const [depotLocation, setDepotLocation] = useState({
    lat: 28.6139, lng: 77.2090, name: 'Connaught Place, New Delhi (Default)',
  });

  /* ── Delivery stops ── */
  const [deliveryPoints, setDeliveryPoints]       = useState(DEFAULT_DELIVERY_POINTS);
  const [isDeliveryModalOpen, setDeliveryModalOpen] = useState(false);

  /* ── Optimization params ── */
  const [params, setParams] = useState(DEFAULT_PARAMS);

  /* ── Results ── */
  const [vehicleRoutes, setVehicleRoutes]           = useState([]);
  const [assignedMarkersInfo, setAssignedMarkersInfo] = useState({});
  const [comparisonData, setComparisonData]         = useState([]);
  const [loading, setLoading]                       = useState(false);

  /* ── Active vehicle highlight ── */
  const [activeVehicleId, setActiveVehicleId] = useState(null);

  /* ── Congestion modifiers (traffic shock demo) ── */
  const [congestionModifiers, setCongestionModifiers] = useState({});

  /* ── Notifications ── */
  const [notification, setNotification] = useState(null);

  /* ── Live traffic WebSocket ── */
  const { trafficState, wsConnected } = useTraffic();

  /* ─────────────────── Live Fleet Polling for Admin ─────────────────── */
  const fetchFleetLive = useCallback(async () => {
    if (currentUser?.role === 'admin') {
      try {
        const res = await getAdminFleetLive();
        setFleetLive(res.data);
      } catch (e) {
        console.warn('Fleet live sync failed:', e);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchFleetLive();
      const interval = setInterval(fetchFleetLive, 4000);
      return () => clearInterval(interval);
    }
  }, [currentUser, fetchFleetLive]);

  /* ─────────────────── Synchronized Stop Statuses ─────────────────── */
  const effectiveDeliveryPoints = useMemo(() => {
    if (!fleetLive?.delivery_stops || fleetLive.delivery_stops.length === 0) {
      return deliveryPoints;
    }
    return deliveryPoints.map(dp => {
      const match = fleetLive.delivery_stops.find(s =>
        (s.name && dp.name && s.name.toLowerCase() === dp.name.toLowerCase()) ||
        (s.id && dp.id && s.id === dp.id) ||
        (Math.abs(s.lat - dp.lat) < 0.001 && Math.abs(s.lng - dp.lng) < 0.001)
      );
      if (match) {
        return {
          ...dp,
          status: match.status,
          delivered_at: match.delivered_at,
          failed_reason: match.failed_reason,
          failed_at: match.failed_at,
          failed_by: match.failed_by,
          assigned_driver_name: match.assigned_driver_name,
          assigned_vehicle: match.assigned_vehicle
        };
      }
      return dp;
    });
  }, [deliveryPoints, fleetLive]);

  /* ─────────────────── Auth Verification ─────────────────── */
  useEffect(() => {
    if (authToken && !currentUser) {
      getMe()
        .then(res => setCurrentUser(res.data))
        .catch(() => {
          localStorage.removeItem('qpath_auth_token');
          localStorage.removeItem('qpath_user');
          setAuthToken(null);
          setCurrentUser(null);
        });
    }
  }, [authToken, currentUser]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('qpath_auth_token');
    localStorage.removeItem('qpath_user');
    setAuthToken(null);
    setCurrentUser(null);
    setNotification({
      type: 'info',
      title: 'Signed Out',
      message: 'You have been safely signed out.',
    });
  }, []);

  /* ─────────────────── GPS sync ─────────────────── */
  useEffect(() => {
    if (userGps?.lat) {
      setDepotLocation(userGps);
      setNotification({
        type: 'success',
        title: '📍 GPS Location Acquired',
        message: `Depot set to your position (${userGps.lat.toFixed(4)}, ${userGps.lng.toFixed(4)})`,
      });
    }
  }, [userGps]);

  /* ─────────────────── Delivery Point Handlers ─────────────────── */
  const handleAddPoint = useCallback((newPt) => {
    setDeliveryPoints(prev => [...prev, newPt]);
    setNotification({ type: 'info', title: 'Stop Added', message: `Added: ${newPt.name}` });
  }, []);

  const handleRemovePoint = useCallback((index) => {
    setDeliveryPoints(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleReorderPoint = useCallback((fromIndex, toIndex) => {
    setDeliveryPoints(prev => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setDeliveryPoints([]);
    setVehicleRoutes([]);
    setAssignedMarkersInfo({});
  }, []);

  const handleLoadPreset = useCallback((presetArray) => {
    setDeliveryPoints(presetArray);
    setVehicleRoutes([]);
    setAssignedMarkersInfo({});
    setNotification({
      type: 'success',
      title: 'Preset Loaded',
      message: `Loaded ${presetArray.length} delivery stops.`,
    });
  }, []);

  /* ── Add stop by map click (when modal is closed) ── */
  const handleMapClick = useCallback((latlng) => {
    if (isDeliveryModalOpen) return;
    setDeliveryPoints(prev => {
      const newIdx = prev.length + 1;
      const newPt = {
        id: `dp_${Date.now()}`,
        name: `Stop D${newIdx} (${latlng.lat.toFixed(3)}, ${latlng.lng.toFixed(3)})`,
        lat: latlng.lat,
        lng: latlng.lng,
        demand: 15.0,
      };
      setNotification({ type: 'info', title: 'Stop Added', message: `Added: ${newPt.name}` });
      return [...prev, newPt];
    });
  }, [isDeliveryModalOpen]);

  /* ─────────────────── Build API payload ─────────────────── */
  const buildPayload = useCallback((algo = 'qpso', modifiers = {}) => ({
    depot: {
      lat: depotLocation.lat,
      lng: depotLocation.lng,
      name: depotLocation.name || 'Starting Depot',
    },
    delivery_points: deliveryPoints.map((pt, idx) => ({
      id: pt.id || `d_${idx + 1}`,
      name: pt.name || `D${idx + 1}`,
      lat: pt.lat,
      lng: pt.lng,
      demand: pt.demand || 10.0,
    })),
    num_vehicles: params.numVehicles,
    vehicle_capacity: params.vehicleCapacity,
    algorithm: algo,
    weights: {
      travel_time: params.weights.w1,
      distance:    params.weights.w2,
      congestion:  params.weights.w3,
      op_cost:     params.weights.w4,
    },
    num_particles:        params.numParticles,
    max_iterations:       params.maxIterations,
    congestion_modifiers: modifiers,
  }), [depotLocation, deliveryPoints, params]);

  /* ─────────────────── QPSO Optimize & Live Benchmark Sync ─────────────────── */
  const handleOptimize = useCallback(async (algo = 'qpso') => {
    if (deliveryPoints.length === 0) {
      alert('Please add at least one delivery stop before optimizing.');
      return;
    }
    setLoading(true);
    setActiveVehicleId(null);
    try {
      const payload = buildPayload(algo, congestionModifiers);
      const res = await optimizeRealRoute(payload);
      const data = res.data;
      setVehicleRoutes(data.vehicle_routes || []);
      setAssignedMarkersInfo(data.assigned_markers_info || {});
      setNotification({
        type: 'success',
        title: '⚡ QPSO Route Optimized',
        message: `Visiting ${deliveryPoints.length} stops across ${params.numVehicles} vehicle(s) in ${data.total_travel_time?.toFixed(1)} min.`,
        savings: `Fleet Cost: ₹${data.total_op_cost?.toFixed(0)}`,
      });

      // Automatically compute/sync algorithm comparison benchmark in background so comparison is always up to date
      try {
        const compRes = await compareRealRoute(payload);
        const compList = compRes.data?.comparison || [];
        setComparisonData(compList);
      } catch (cErr) {
        console.warn('Background comparison sync error:', cErr);
      }
    } catch (err) {
      console.error('Optimization failed:', err);
      setNotification({
        type: 'error',
        title: 'Optimization Failed',
        message: err.response?.data?.detail || err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [deliveryPoints, buildPayload, congestionModifiers, params.numVehicles]);

  /* ─────────────────── Algorithm Comparison Manual Trigger ─────────────────── */
  const handleCompare = useCallback(async () => {
    if (deliveryPoints.length === 0) {
      alert('Please add at least one delivery stop before comparing algorithms.');
      return;
    }
    setLoading(true);
    try {
      const res = await compareRealRoute(buildPayload('qpso', congestionModifiers));
      const data = res.data;
      const list = data.comparison || (Array.isArray(data) ? data : []);
      setComparisonData(list);
      if (data.vehicle_routes) {
        setVehicleRoutes(data.vehicle_routes);
        setAssignedMarkersInfo(data.assigned_markers_info || {});
      }
      setNotification({
        type: 'success',
        title: '📊 Comparison Complete',
        message: `Benchmarked ${list.length} algorithms. View results in the Comparison tab.`,
      });
    } catch (err) {
      console.error('Comparison failed:', err);
      setNotification({
        type: 'error',
        title: 'Comparison Failed',
        message: err.response?.data?.detail || err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [deliveryPoints, buildPayload, congestionModifiers]);

  /* ─────────────────── Traffic Shock & Dynamic Re-route ─────────────────── */
  const handleSimulateReroute = useCallback(async () => {
    if (deliveryPoints.length < 2) {
      alert('Add at least 2 delivery stops to demonstrate dynamic re-routing.');
      return;
    }
    const updatedModifiers = { ...congestionModifiers, '1->2': 0.95, '2->1': 0.95 };
    setCongestionModifiers(updatedModifiers);
    setNotification({
      type: 'warning',
      title: '🚨 Traffic Incident Detected!',
      message: 'Heavy congestion injected on D1 ➔ D2 corridor. QPSO dynamically re-optimizing...',
    });
    setLoading(true);
    try {
      const payload = buildPayload('qpso', updatedModifiers);
      const res = await optimizeRealRoute(payload);
      const data = res.data;
      setVehicleRoutes(data.vehicle_routes || []);
      setAssignedMarkersInfo(data.assigned_markers_info || {});

      // Keep comparison updated with the new traffic incident data
      try {
        const compRes = await compareRealRoute(payload);
        setComparisonData(compRes.data?.comparison || []);
      } catch (cErr) {
        console.warn('Background comparison update error:', cErr);
      }

      setTimeout(() => {
        setNotification({
          type: 'success',
          title: '✨ Dynamic Re-Route Completed',
          message: `QPath bypassed congestion. New ETA: ${data.total_travel_time?.toFixed(1)} min | ${data.total_distance?.toFixed(2)} km`,
        });
      }, 800);
    } catch (err) {
      console.error('Re-route failed:', err);
    } finally {
      setLoading(false);
    }
  }, [deliveryPoints, buildPayload, congestionModifiers]);

  /* ─────────────────────────── RENDER ─────────────────────────── */
  // 1. Customer Token present in URL or entered -> Strictly render isolated Customer Dashboard
  if (customerToken) {
    return (
      <CustomerDashboard
        token={customerToken}
        onExit={() => {
          setCustomerToken(null);
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('customer');
            url.searchParams.delete('token');
            url.searchParams.delete('track');
            window.history.replaceState({}, document.title, url.pathname);
          } catch {
            // ignore
          }
        }}
      />
    );
  }

  // 2. Unauthenticated -> Render Login Page
  if (!authToken || !currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user, token) => {
          setCurrentUser(user);
          setAuthToken(token);
        }}
        onTrackCustomer={(token) => {
          setCustomerToken(token);
        }}
      />
    );
  }

  // 3. Driver Role -> Strictly render isolated Driver Dashboard (blocks all admin access)
  if (currentUser.role === 'driver') {
    return (
      <DriverDashboard
        user={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  // 4. Admin Role -> Render Full Operations & Multi-Vehicle Optimization Dashboard
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0f172a',
      color: '#f8fafc',
      fontFamily: "'Inter', sans-serif",
      overflow: 'hidden',
    }}>

      {/* ════════════════ HEADER ════════════════ */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#1e293b',
        padding: '10px 20px',
        borderBottom: '1px solid #334155',
        flexShrink: 0,
        zIndex: 100,
      }}>
        {/* Logo + Subtitle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>⚛</span>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#60a5fa', letterSpacing: '-0.5px' }}>
                QPath
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: '700',
                padding: '2px 7px',
                borderRadius: '4px',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.4)'
              }}>
                ADMIN PORTAL
              </span>
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>
              Quantum-Inspired Intelligent Traffic Route Optimization · SIH 2026 #26137
            </div>
          </div>

          {/* GPS status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: '#0f172a',
            border: `1px solid ${geoStatus === 'granted' ? '#10b981' : '#475569'}`,
            borderRadius: '20px', padding: '3px 10px',
            fontSize: '11px', color: geoStatus === 'granted' ? '#10b981' : '#94a3b8',
          }}>
            <span>{geoStatus === 'granted' ? '📍' : '🔕'}</span>
            {geoStatus === 'granted' ? 'GPS Active' : 'GPS Off'}
            {geoStatus !== 'granted' && (
              <button
                onClick={requestLocation}
                style={{ marginLeft: '4px', background: 'none', border: 'none', color: '#60a5fa', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Enable
              </button>
            )}
          </div>
        </div>

        {/* Page Navigation */}
        <nav style={{
          display: 'flex', background: '#0f172a', border: '1px solid #334155',
          borderRadius: '10px', padding: '3px', gap: '2px',
        }}>
          {[
            { id: 'operations', label: '📍 Route Operations' },
            { id: 'comparison', label: '📊 Algorithm Comparison' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setAppPage(id)}
              style={{
                padding: '7px 16px', borderRadius: '8px', border: 'none',
                background: appPage === id ? '#2563eb' : 'transparent',
                color: appPage === id ? '#fff' : '#94a3b8',
                fontSize: '12px', fontWeight: appPage === id ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Live status indicators + User Profile & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: wsConnected ? '#10b981' : '#64748b' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: wsConnected ? '#10b981' : '#64748b',
              display: 'inline-block',
              boxShadow: wsConnected ? '0 0 6px #10b981' : 'none',
            }} />
            {wsConnected ? 'Traffic Feed Live' : 'Traffic Offline'}
          </div>
          <div style={{
            background: '#0f172a', border: '1px solid #334155',
            borderRadius: '6px', padding: '3px 10px', color: '#94a3b8',
          }}>
            {deliveryPoints.length} stops · {params.numVehicles} vehicle{params.numVehicles !== 1 ? 's' : ''}
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#60a5fa', fontWeight: 'bold' }}>
              <span style={{ fontSize: '14px', animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⚛</span>
              QPSO Running…
            </div>
          )}

          {/* Admin User Chip & Logout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginLeft: '8px',
            paddingLeft: '10px',
            borderLeft: '1px solid #334155'
          }}>
            <span style={{ color: '#cbd5e1', fontWeight: '500' }}>
              {currentUser.name || currentUser.username}
            </span>
            <button
              onClick={handleLogout}
              style={{
                backgroundColor: '#334155',
                border: '1px solid #475569',
                color: '#f1f5f9',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.15s'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ════════════════ OPERATIONS PAGE ════════════════ */}
      {appPage === 'operations' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* LEFT PANEL — Vehicle Details & Fleet Control */}
          <div style={{
            width: '340px', flexShrink: 0, overflowY: 'auto',
            borderRight: '1px solid #334155',
            background: '#1a2332', padding: '14px',
          }}>
            <VehicleDetailsPanel
              vehicleRoutes={vehicleRoutes}
              activeVehicleId={activeVehicleId}
              onSelectVehicle={setActiveVehicleId}
              params={params}
              setParams={setParams}
              onOpenDeliveryModal={() => setDeliveryModalOpen(true)}
              onOptimize={handleOptimize}
              onSimulateReroute={handleSimulateReroute}
              loading={loading}
              comparison={comparisonData}
              onSwitchPage={setAppPage}
              liveDrivers={fleetLive?.drivers || []}
              availableJobsCount={fleetLive?.total_available_jobs || 0}
              pendingVerifications={fleetLive?.pending_verifications || []}
              onRefreshFleetLive={fetchFleetLive}
            />
          </div>

          {/* CENTER — Map */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <MapView
              isRealWorldMode={true}
              depot={depotLocation}
              deliveryPoints={effectiveDeliveryPoints}
              vehicleRoutes={vehicleRoutes}
              assignedMarkersInfo={assignedMarkersInfo}
              activeVehicleId={activeVehicleId}
              onMapClick={handleMapClick}
              graphData={null}
              trafficState={trafficState}
              activeDrivers={fleetLive?.drivers || []}
            />

            <TrafficLegend trafficState={trafficState} wsConnected={wsConnected} />

            {/* QPSO loading overlay */}
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(10,16,30,0.82)',
                zIndex: 2000, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '14px',
                backdropFilter: 'blur(4px)',
              }}>
                <div style={{ fontSize: '48px', animation: 'spin 1.4s linear infinite' }}>⚛</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#60a5fa' }}>
                  Quantum Particle Swarm Optimization
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', maxWidth: '300px' }}>
                  Evaluating quantum wave-function collapse, BPR traffic impedance,
                  and multi-vehicle VRP particle search space…
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['Initializing particles', 'Evaluating fitness', 'Quantum tunneling', 'Converging'].map((step, i) => (
                    <div key={i} style={{
                      fontSize: '10px', color: '#475569', background: '#1e293b',
                      padding: '3px 8px', borderRadius: '20px', border: '1px solid #334155',
                    }}>{step}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Map hint when empty */}
            {!isDeliveryModalOpen && vehicleRoutes.length === 0 && deliveryPoints.length === 0 && (
              <div style={{
                position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(30,41,59,0.92)', border: '1px solid #334155',
                borderRadius: '20px', padding: '8px 18px', fontSize: '12px',
                color: '#94a3b8', zIndex: 800, backdropFilter: 'blur(6px)', pointerEvents: 'none',
              }}>
                Click the map to add stops, or use <strong style={{ color: '#60a5fa' }}>+ Add Stops</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════ COMPARISON PAGE ════════════════ */}
      {appPage === 'comparison' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ComparisonPage
            comparison={comparisonData}
            onRunComparison={handleCompare}
            loading={loading}
            params={params}
            setParams={setParams}
          />
        </div>
      )}

      {/* ════════════════ DELIVERY MODAL ════════════════ */}
      <DeliveryModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        depot={depotLocation}
        deliveryPoints={deliveryPoints}
        onAddPoint={handleAddPoint}
        onRemovePoint={handleRemovePoint}
        onReorderPoint={handleReorderPoint}
        onClearAll={handleClearAll}
        onLoadPreset={handleLoadPreset}
        onOptimize={() => {
          setDeliveryModalOpen(false);
          handleOptimize('qpso');
        }}
        geoStatus={geoStatus}
        onRequestGps={requestLocation}
      />

      {/* ════════════════ NOTIFICATION TOAST ════════════════ */}
      <NotificationToast
        notification={notification}
        onDismiss={() => setNotification(null)}
      />

      {/* ════════════════ GLOBAL STYLES ════════════════ */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
        input[type="range"] { accent-color: #3b82f6; cursor: pointer; }
      `}</style>
    </div>
  );
}
