import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Fix default leaflet marker icon asset issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Distinct, vibrant, high-contrast vehicle color themes
export const VEHICLE_PALETTE = [
  { main: '#10b981', halo: 'rgba(16, 185, 129, 0.45)', name: 'Vehicle 1 (Emerald)' },
  { main: '#06b6d4', halo: 'rgba(6, 182, 212, 0.45)', name: 'Vehicle 2 (Cyan)' },
  { main: '#f59e0b', halo: 'rgba(245, 158, 11, 0.45)', name: 'Vehicle 3 (Amber)' },
  { main: '#8b5cf6', halo: 'rgba(139, 92, 246, 0.45)', name: 'Vehicle 4 (Violet)' },
  { main: '#ec4899', halo: 'rgba(236, 72, 153, 0.45)', name: 'Vehicle 5 (Pink)' }
];

// Helper to calculate bearing between two coordinate points
function computeBearing(p1, p2) {
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// Directional Arrow SVG Icon for directed paths
const createDirectionalArrowIcon = (bearing, color = '#ffffff') => {
  return L.divIcon({
    className: 'route-directional-arrow',
    html: `
      <div style="
        transform: rotate(${bearing}deg);
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.95));">
          <circle cx="12" cy="12" r="11" fill="rgba(15, 23, 42, 0.75)" stroke="${color}" stroke-width="1.5" />
          <path d="M7 16L12 11L17 16M7 11L12 6L17 11" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
};

// Helper to create custom numbered HTML divIcons for delivery points with assigned vehicle color
const createNumberedDeliveryIcon = (label, vehicleId = 1, status = 'Pending') => {
  const isDelivered = status === 'Delivered';
  const isFailed = status === 'Failed';
  const palette = VEHICLE_PALETTE[(vehicleId - 1) % VEHICLE_PALETTE.length] || VEHICLE_PALETTE[0];
  const bg = isDelivered ? '#10b981' : isFailed ? '#ef4444' : palette.main;
  const halo = isDelivered ? 'rgba(16, 185, 129, 0.5)' : isFailed ? 'rgba(239, 68, 68, 0.5)' : palette.halo;
  const content = isDelivered ? '✓' : isFailed ? '✕' : label;

  return L.divIcon({
    className: 'custom-numbered-marker',
    html: `
      <div style="
        background: ${bg};
        color: #ffffff;
        border: 2px solid ${isDelivered ? '#a7f3d0' : isFailed ? '#fca5a5' : '#ffffff'};
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: ${isDelivered || isFailed ? '14px' : '11px'};
        box-shadow: 0 4px 12px ${halo}, 0 2px 5px rgba(0,0,0,0.5);
        opacity: ${isDelivered ? 0.85 : 1};
      ">
        ${content}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

// Driver Truck Icon for Active Drivers
const createDriverTruckIcon = (driverName, vehicleName, color = '#10b981') => {
  return L.divIcon({
    className: 'custom-driver-truck-marker',
    html: `
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: rgba(15, 23, 42, 0.95);
        border: 2px solid ${color};
        border-radius: 18px;
        padding: 3px 8px;
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
        box-shadow: 0 4px 14px rgba(0,0,0,0.7), 0 0 10px ${color}88;
        white-space: nowrap;
      ">
        <span style="font-size: 13px;">🚚</span>
        <span>${driverName || vehicleName}</span>
      </div>
    `,
    iconSize: [110, 28],
    iconAnchor: [55, 14],
    popupAnchor: [0, -16]
  });
};

// Depot Marker Icon
const createDepotIcon = () => {
  return L.divIcon({
    className: 'custom-depot-marker',
    html: `
      <div style="
        background: #2563eb;
        color: white;
        border: 3px solid #ffffff;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: 0 4px 16px rgba(37,99,235,0.6), 0 2px 6px rgba(0,0,0,0.6);
      ">
        🏠
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

// Map click handler to drop delivery points
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng);
      }
    }
  });
  return null;
}

// Map center controller that ONLY centers ONCE on initial load to avoid jumping/re-zooming
function MapCenterController({ center, zoom, resetTrigger }) {
  const map = useMap();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    // Only set view once on startup or when user explicitly triggers reset
    if ((!hasInitializedRef.current || resetTrigger) && center && center[0] && center[1]) {
      map.setView(center, zoom || 13, { animate: hasInitializedRef.current });
      hasInitializedRef.current = true;
    }
  }, [center, zoom, map, resetTrigger]);

  return null;
}

// Helper to determine traffic color for a leg
function getTrafficColor(leg) {
  if (leg.traffic_color) return leg.traffic_color;
  const pct = leg.congestion_pct || (leg.congestion ? leg.congestion * 100 : 25);
  if (pct < 35) return '#10b981'; // Green (Low Traffic)
  if (pct < 65) return '#f59e0b'; // Yellow / Amber (Moderate Traffic)
  return '#ef4444'; // Red (High Traffic / Delay)
}

export default function MapView({
  isRealWorldMode = true,
  depot,
  deliveryPoints = [],
  vehicleRoutes = [],          // Rich routes from RealVRPAdapter with legs & polylines
  assignedMarkersInfo = {},    // Map of Stop label -> detailed vehicle assignment metadata
  activeVehicleId = null,      // If non-null, highlight this specific vehicle
  onMapClick,
  graphData,
  trafficState,
  activeDrivers = []           // Live fleet drivers with GPS locations and statuses
}) {
  const centerLat = depot?.lat || 28.6139;
  const centerLng = depot?.lng || 77.2090;
  const [recenterCounter, setRecenterCounter] = React.useState(0);

  // Extract rich directional arrow markers along road paths for directed route visualization
  const directionalArrows = useMemo(() => {
    const arrows = [];
    if (!vehicleRoutes || vehicleRoutes.length === 0) return arrows;

    vehicleRoutes.forEach((vRoute, vIdx) => {
      const isFaded = activeVehicleId !== null && activeVehicleId !== vRoute.vehicle_id;
      if (isFaded) return;

      vRoute.legs?.forEach((leg, legIdx) => {
        const coords = leg.path_coords || [];
        if (coords.length < 2) return;

        // Denser sampling: place arrows every 8 to 15 coordinate points
        const step = Math.max(6, Math.floor(coords.length / 5));

        for (let idx = Math.floor(step / 2); idx < coords.length - 1; idx += step) {
          const p1 = coords[idx];
          const p2 = coords[idx + 1];
          const bearing = computeBearing(p1, p2);
          const trafficCol = getTrafficColor(leg);

          arrows.push({
            key: `arrow_${vIdx}_${legIdx}_${idx}`,
            lat: p1.lat,
            lng: p1.lng,
            bearing,
            color: '#38bdf8', // Bright Cyan for high contrast visibility
            trafficColor: trafficCol,
            vehicleId: vRoute.vehicle_id
          });
        }
      });
    });

    return arrows;
  }, [vehicleRoutes, activeVehicleId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      
      {/* MAP CONTAINER */}
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={13}
        style={{ height: '100%', width: '100%', borderRadius: '12px', background: '#0f172a' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <MapCenterController center={[centerLat, centerLng]} zoom={13} resetTrigger={recenterCounter} />
        <MapClickHandler onMapClick={onMapClick} />

        {/* ---------------- REAL-WORLD DELIVERY MODE ---------------- */}
        {isRealWorldMode ? (
          <>
            {/* 1. Starting Depot Marker */}
            {depot && (
              <Marker position={[depot.lat, depot.lng]} icon={createDepotIcon()}>
                <Popup>
                  <div style={{ color: '#0f172a', padding: '6px', minWidth: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '16px' }}>🏠</span>
                      <strong style={{ color: '#2563eb', fontSize: '14px' }}>Starting Depot (Origin)</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#334155' }}>{depot.name || 'My GPS Location'}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      GPS: {depot.lat?.toFixed(4)}, {depot.lng?.toFixed(4)}
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>
                      ✓ All delivery vehicles start & return here
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* 2. Numbered Delivery Points Markers (D1, D2, D3...) */}
            {deliveryPoints.map((pt, idx) => {
              const label = pt.label || `D${idx + 1}`;
              const meta = assignedMarkersInfo[label] || {};
              const assignedVeh = meta.assigned_vehicle || 1;
              const assignedDriver = pt.assigned_driver_name || (assignedVeh === 1 ? 'Rajesh Kumar (driver1)' : assignedVeh === 2 ? 'Amit Sharma (driver2)' : `Driver ${assignedVeh}`);
              const isDelivered = pt.status === 'Delivered';
              const isFailed = pt.status === 'Failed';


              return (
                <Marker
                  key={pt.id || `dp_${idx}`}
                  position={[pt.lat, pt.lng]}
                  icon={createNumberedDeliveryIcon(label, assignedVeh, pt.status)}
                >
                  <Popup>
                    <div style={{ color: '#0f172a', padding: '6px', minWidth: '220px' }}>
                      {/* Title Header with Assigned Vehicle Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <strong style={{ color: '#0f172a', fontSize: '14px' }}>
                          Delivery Stop {label}
                        </strong>
                        <span style={{
                          background: isDelivered ? '#10b981' : isFailed ? '#ef4444' : (VEHICLE_PALETTE[(assignedVeh - 1) % VEHICLE_PALETTE.length]?.main || '#3b82f6'),
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          padding: '2px 7px',
                          borderRadius: '6px'
                        }}>
                          {isDelivered ? '✓ Delivered' : isFailed ? '✕ Not Delivered' : `Vehicle ${assignedVeh}`}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#334155', marginBottom: '6px', lineHeight: 1.3 }}>
                        📍 <strong>Address:</strong> {pt.name}
                      </div>

                      {/* Failure Reason Callout for Admin */}
                      {isFailed && (
                        <div style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          marginBottom: '6px',
                          fontSize: '11px',
                          color: '#b91c1c'
                        }}>
                          <strong>⚠️ Reason for Failure:</strong><br />
                          {pt.failed_reason || 'Could not be delivered'}<br />
                          {pt.failed_at && <span style={{ fontSize: '10px', color: '#64748b' }}>Reported: {pt.failed_at} by {pt.failed_by || assignedDriver}</span>}
                        </div>
                      )}

                      {/* Driver Assignment Callout */}
                      <div style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        marginBottom: '6px',
                        fontSize: '11px',
                        color: '#1e40af'
                      }}>
                        👤 <strong>Responsible:</strong> {assignedDriver}
                      </div>

                      {/* Detailed Delivery Information Grid */}
                      <div style={{
                        background: '#f1f5f9',
                        padding: '8px',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        fontSize: '11px'
                      }}>
                        <div>
                          <strong>Status:</strong> <span style={{ color: isDelivered ? '#059669' : isFailed ? '#dc2626' : '#2563eb', fontWeight: 'bold' }}>{isFailed ? 'Not Delivered (Returning to Hub)' : (pt.status || 'Pending')}</span>
                          {pt.delivered_at && <span> (at {pt.delivered_at})</span>}
                        </div>
                        <div>
                          <strong>Sequence:</strong> Stop #{meta.sequence_index || (idx + 1)} of {meta.total_stops_in_vehicle || deliveryPoints.length}
                        </div>
                        <div>
                          <strong>Est. Arrival Time (ETA):</strong> <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{meta.estimated_arrival_clock || `+${((idx+1)*12)} min`}</span>
                        </div>
                        <div>
                          <strong>Package Load:</strong> {pt.demand || 10} kg
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* 2b. Active Drivers Live GPS Position Markers */}
            {activeDrivers?.map((driver, dIdx) => {
              if (!driver.current_location?.lat || !driver.current_location?.lng) return null;
              return (
                <Marker
                  key={`active_driver_${driver.driver_id || dIdx}`}
                  position={[driver.current_location.lat, driver.current_location.lng]}
                  icon={createDriverTruckIcon(driver.driver_name, driver.vehicle, driver.route_color || '#10b981')}
                >
                  <Popup>
                    <div style={{ color: '#0f172a', padding: '6px', minWidth: '190px' }}>
                      <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '4px' }}>
                        🚚 {driver.driver_name} ({driver.driver_id})
                      </div>
                      <div style={{ fontSize: '11px', color: '#334155', lineHeight: 1.4 }}>
                        Vehicle: <strong>{driver.vehicle}</strong><br/>
                        Status: <strong style={{ color: driver.status === 'En Route' ? '#0284c7' : '#059669' }}>{driver.status}</strong><br/>
                        {driver.accepted_job_id && <>Job Claimed: <strong>{driver.accepted_job_id}</strong><br/></>}
                        Deliveries Done: <strong>{driver.completed_count} / {driver.total_stops}</strong>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* 3. High-Contrast Traffic-Colored Route Lines with Flowing Directional Animation */}
            {vehicleRoutes?.map((vRoute, vIdx) => {
              const palette = VEHICLE_PALETTE[vIdx % VEHICLE_PALETTE.length];
              const isFaded = activeVehicleId !== null && activeVehicleId !== vRoute.vehicle_id;
              const isHighlighted = activeVehicleId === vRoute.vehicle_id;

              if (!vRoute.polyline || vRoute.polyline.length === 0) return null;
              const fullPositions = vRoute.polyline.map(p => Array.isArray(p) ? [p[0], p[1]] : [p.lat, p.lng]);


              return (
                <React.Fragment key={`veh_route_${vIdx}`}>
                  {/* Underlay Vehicle Halo to clearly identify which vehicle owns this path */}
                  <Polyline
                    positions={fullPositions}
                    color={palette.main}
                    weight={isHighlighted ? 14 : 10}
                    opacity={isFaded ? 0.08 : 0.35}
                  />

                  {/* Render Each Leg Colored by Traffic Congestion (Green=Low, Yellow=Moderate, Red=High) */}
                  {vRoute.legs?.map((leg, legIdx) => {
                    const legPts = leg.path_coords?.map(p => [p.lat, p.lng]) || [];
                    if (legPts.length < 2) return null;
                    const trafficColor = getTrafficColor(leg);

                    return (
                      <React.Fragment key={`leg_${vIdx}_${legIdx}`}>
                        {/* Solid Traffic Base Line */}
                        <Polyline
                          positions={legPts}
                          color={trafficColor}
                          weight={isHighlighted ? 7 : 5}
                          opacity={isFaded ? 0.15 : 0.95}
                          lineCap="round"
                          lineJoin="round"
                        >
                          <Popup>
                            <div style={{ color: '#0f172a', padding: '4px', minWidth: '190px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <strong style={{ color: palette.main, fontSize: '13px' }}>
                                  Vehicle {vRoute.vehicle_id} • Leg {legIdx + 1}
                                </strong>
                                <span style={{
                                  background: trafficColor,
                                  color: '#fff',
                                  fontSize: '10px',
                                  fontWeight: 'bold',
                                  padding: '1px 6px',
                                  borderRadius: '4px'
                                }}>
                                  {leg.traffic_condition || 'Traffic'}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', marginTop: '4px', fontWeight: '600' }}>
                                {leg.from_name} ➔ {leg.to_name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#334155', marginTop: '6px', lineHeight: 1.4 }}>
                                📏 Distance: <strong>{leg.distance_km} km</strong><br/>
                                ⏱ Travel Time: <strong>{leg.travel_time_min} min</strong><br/>
                                🚦 Congestion: <strong style={{ color: trafficColor }}>{leg.congestion_pct}%</strong><br/>
                                🏁 Arrival ETA: <strong>{leg.estimated_arrival_clock}</strong>
                              </div>
                            </div>
                          </Popup>
                        </Polyline>

                        {/* Flowing Animated Dash Overlay showing live direction of motion */}
                        <Polyline
                          positions={legPts}
                          pathOptions={{
                            color: '#ffffff',
                            weight: 2.2,
                            opacity: isFaded ? 0.05 : 0.85,
                            dashArray: '8, 14',
                            className: 'animated-flow-direction-line'
                          }}
                        />
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* 4. Directed Path Arrow Markers along the Road Curves */}
            {directionalArrows.map((arrow) => (
              <Marker
                key={arrow.key}
                position={[arrow.lat, arrow.lng]}
                icon={createDirectionalArrowIcon(arrow.bearing, arrow.color)}
                interactive={false}
              />
            ))}
          </>
        ) : (
          /* ---------------- SIMULATED GRID GRAPH MODE ---------------- */
          <>
            {graphData?.edges?.map((edge, i) => {
              const fromNode = graphData.nodes?.find(n => n.id === edge.source);
              const toNode = graphData.nodes?.find(n => n.id === edge.target);
              if (!fromNode || !toNode) return null;
              return (
                <Polyline
                  key={`sim_edge_${i}`}
                  positions={[[fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]]}
                  color={edge.congestion > 0.6 ? '#ef4444' : edge.congestion > 0.3 ? '#f59e0b' : '#10b981'}
                  weight={1.5}
                  opacity={0.4}
                />
              );
            })}
          </>
        )}
      </MapContainer>

      {/* RECENTER BUTTON */}
      <button
        onClick={() => setRecenterCounter(c => c + 1)}
        style={{
          position: 'absolute',
          bottom: '18px',
          right: '18px',
          zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.90)',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '8px 12px',
          color: '#38bdf8',
          fontSize: '11px',
          fontWeight: 'bold',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}
        title="Recenter map view on Starting Depot"
      >
        <span>📍</span> Recenter Depot
      </button>

      {/* FLOATING MAP LEGEND */}
      <div style={{
        position: 'absolute',
        top: '14px',
        right: '14px',
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #334155',
        borderRadius: '10px',
        padding: '12px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '240px'
      }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🗺️ Route & Traffic Legend
        </div>
        
        {/* Origin Hub */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#f8fafc' }}>
          <span style={{ fontSize: '14px' }}>🏠</span>
          <span>Starting Depot (GPS)</span>
        </div>

        {/* Direction of travel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#f8fafc' }}>
          <span style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '13px' }}>➔➔</span>
          <span>Directed Path of Travel</span>
        </div>

        {/* Traffic Condition Colors */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>TRAFFIC CONDITIONS:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1' }}>
            <span style={{ width: '12px', height: '4px', borderRadius: '2px', background: '#10b981' }}/>
            <span>Low Traffic (Free Flow)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#f59e0b' }}
>
            <span style={{ width: '12px', height: '4px', borderRadius: '2px', background: '#f59e0b' }}/>
            <span>Moderate Traffic</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1' }}>
            <span style={{ width: '12px', height: '4px', borderRadius: '2px', background: '#ef4444' }}/>
            <span>High Congestion / Delay</span>
          </div>
        </div>

        {/* Vehicle Fleet list */}
        {vehicleRoutes && vehicleRoutes.length > 0 && (
          <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>ASSIGNED VEHICLES:</div>
            {vehicleRoutes.map((v, i) => {
              const pal = VEHICLE_PALETTE[i % VEHICLE_PALETTE.length];
              const isStandby = !v.assigned_stops || v.assigned_stops.length === 0;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: isStandby ? '#64748b' : '#f8fafc' }}>
                  <span style={{ width: '14px', height: '4px', borderRadius: '2px', background: pal.main, flexShrink: 0, opacity: isStandby ? 0.3 : 1 }}/>
                  <span>Vehicle {v.vehicle_id}: {isStandby ? 'Standby (0 stops)' : `${v.assigned_stops.length} stop${v.assigned_stops.length !== 1 ? 's' : ''}`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes flowDashAnim {
          from { stroke-dashoffset: 22; }
          to   { stroke-dashoffset: 0; }
        }
        .animated-flow-direction-line {
          animation: flowDashAnim 1.1s linear infinite !important;
        }
      `}</style>

    </div>
  );
}
