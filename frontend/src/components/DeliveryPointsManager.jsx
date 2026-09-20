import React, { useState } from 'react';
import { searchAddress } from '../services/api';

const PRESET_LOCATIONS = {
  delhi: [
    { id: 'd1', name: 'India Gate, New Delhi', lat: 28.6129, lng: 77.2295, demand: 15.0 },
    { id: 'd2', name: 'AIIMS Hospital, Ansari Nagar', lat: 28.5672, lng: 77.2100, demand: 20.0 },
    { id: 'd3', name: 'Karol Bagh Market', lat: 28.6517, lng: 77.1906, demand: 12.0 },
    { id: 'd4', name: 'Lajpat Nagar Central Market', lat: 28.5700, lng: 77.2400, demand: 18.0 },
    { id: 'd5', name: 'Hauz Khas Village', lat: 28.5494, lng: 77.1932, demand: 10.0 }
  ],
  mumbai: [
    { id: 'd1', name: 'Gateway of India, Colaba', lat: 18.9220, lng: 72.8347, demand: 15.0 },
    { id: 'd2', name: 'Bandra Kurla Complex (BKC)', lat: 19.0657, lng: 72.8688, demand: 25.0 },
    { id: 'd3', name: 'Juhu Beach, Andheri West', lat: 19.0988, lng: 72.8267, demand: 14.0 },
    { id: 'd4', name: 'Dadar TT Circle', lat: 19.0178, lng: 72.8478, demand: 18.0 }
  ],
  bengaluru: [
    { id: 'd1', name: 'MG Road Metro Station', lat: 12.9756, lng: 77.6066, demand: 12.0 },
    { id: 'd2', name: 'Indiranagar 100ft Road', lat: 12.9784, lng: 77.6408, demand: 16.0 },
    { id: 'd3', name: 'Koramangala 5th Block', lat: 12.9352, lng: 77.6245, demand: 22.0 },
    { id: 'd4', name: 'Whitefield ITPL Main Road', lat: 12.9866, lng: 77.7381, demand: 20.0 }
  ]
};

export default function DeliveryPointsManager({
  depot,
  deliveryPoints,
  onAddPoint,
  onRemovePoint,
  onReorderPoint,
  onUpdateDemand,
  onClearAll,
  onLoadPreset,
  geoStatus,
  onRequestGps
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showCoordForm, setShowCoordForm] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualDemand, setManualDemand] = useState('15');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await searchAddress(searchQuery);
    setSearchResults(results);
    setSearching(false);
  };

  const handleSelectSearchResult = (res) => {
    onAddPoint({
      id: `d_${Date.now()}`,
      name: res.short_name || res.name,
      lat: res.lat,
      lng: res.lng,
      demand: 15.0
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleAddManualCoord = (e) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid decimal coordinates.');
      return;
    }
    onAddPoint({
      id: `d_${Date.now()}`,
      name: manualName.trim() || `Coord (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
      lat,
      lng,
      demand: parseFloat(manualDemand) || 15.0
    });
    setManualLat('');
    setManualLng('');
    setManualName('');
    setShowCoordForm(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      
      {/* Starting Depot / GPS Status Box */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏠</span> Starting Depot (GPS)
          </span>
          <button
            onClick={onRequestGps}
            style={{
              background: geoStatus === 'granted' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
              border: `1px solid ${geoStatus === 'granted' ? '#10b981' : '#3b82f6'}`,
              color: geoStatus === 'granted' ? '#34d399' : '#60a5fa',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
            title="Refresh GPS Location"
          >
            {geoStatus === 'granted' ? '📍 GPS Active' : '📡 Get GPS'}
          </button>
        </div>
        <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
          {depot?.name || 'Current Location'}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b' }}>
          Lat: {depot?.lat?.toFixed(4)}, Lng: {depot?.lng?.toFixed(4)}
        </div>
      </div>

      {/* Address Search Bar */}
      <div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            placeholder="Search address / place..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#fff',
              fontSize: '13px'
            }}
          />
          <button
            type="submit"
            disabled={searching}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {searching ? '...' : 'Search'}
          </button>
        </form>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div style={{
            marginTop: '6px',
            background: '#0f172a',
            border: '1px solid #475569',
            borderRadius: '6px',
            maxHeight: '160px',
            overflowY: 'auto'
          }}>
            {searchResults.map((res, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectSearchResult(res)}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid #334155',
                  fontSize: '12px',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <strong>+ Add:</strong> {res.short_name} <span style={{ color: '#94a3b8', fontSize: '11px' }}>({res.lat.toFixed(3)}, {res.lng.toFixed(3)})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Coordinate Form Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => setShowCoordForm(!showCoordForm)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '12px',
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: 0
          }}
        >
          {showCoordForm ? '▲ Hide Coordinate Input' : '▼ Enter Lat/Lng Manually'}
        </button>
        
        {/* Click map hint */}
        <span style={{ fontSize: '11px', color: '#10b981' }}>
          💡 Click map to add
        </span>
      </div>

      {showCoordForm && (
        <form onSubmit={handleAddManualCoord} style={{ background: '#1e293b', padding: '10px', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            type="text"
            placeholder="Place / Stop Name"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #475569', background: '#334155', color: '#fff', fontSize: '12px' }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="number"
              step="any"
              placeholder="Latitude"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              required
              style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid #475569', background: '#334155', color: '#fff', fontSize: '12px' }}
            />
            <input
              type="number"
              step="any"
              placeholder="Longitude"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              required
              style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid #475569', background: '#334155', color: '#fff', fontSize: '12px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8' }}>Demand (kg):</label>
            <input
              type="number"
              min="1"
              max="500"
              value={manualDemand}
              onChange={(e) => setManualDemand(e.target.value)}
              style={{ width: '70px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #475569', background: '#334155', color: '#fff', fontSize: '12px' }}
            />
            <button
              type="submit"
              style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: '4px', border: 'none', background: '#10b981', color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              + Add Point
            </button>
          </div>
        </form>
      )}

      {/* Quick City Presets */}
      <div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Quick City Presets:</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['delhi', 'mumbai', 'bengaluru'].map((city) => (
            <button
              key={city}
              onClick={() => onLoadPreset(PRESET_LOCATIONS[city])}
              style={{
                flex: 1,
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#94a3b8',
                fontSize: '11px',
                textTransform: 'capitalize',
                cursor: 'pointer'
              }}
            >
              {city} ({PRESET_LOCATIONS[city].length})
            </button>
          ))}
        </div>
      </div>

      {/* Delivery Points List */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#e2e8f0' }}>
            Delivery Points ({deliveryPoints.length})
          </span>
          {deliveryPoints.length > 0 && (
            <button
              onClick={onClearAll}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', padding: 0 }}
            >
              Clear All
            </button>
          )}
        </div>

        {deliveryPoints.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px', border: '1px dashed #334155', borderRadius: '8px' }}>
            No delivery points added yet.<br/>Search above or click on the map.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
            {deliveryPoints.map((pt, idx) => (
              <div
                key={pt.id || idx}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {/* Numbered Badge */}
                <span style={{
                  background: '#3b82f6',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '3px 7px',
                  borderRadius: '10px',
                  flexShrink: 0
                }}>
                  D{idx + 1}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pt.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '8px' }}>
                    <span>{pt.lat?.toFixed(3)}, {pt.lng?.toFixed(3)}</span>
                    <span>•</span>
                    <span>{pt.demand || 10} kg</span>
                  </div>
                </div>

                {/* Reorder Up/Down */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    disabled={idx === 0}
                    onClick={() => onReorderPoint(idx, idx - 1)}
                    style={{ background: 'transparent', border: 'none', color: idx === 0 ? '#475569' : '#cbd5e1', fontSize: '10px', cursor: idx === 0 ? 'default' : 'pointer', padding: '0 2px' }}
                  >
                    ▲
                  </button>
                  <button
                    disabled={idx === deliveryPoints.length - 1}
                    onClick={() => onReorderPoint(idx, idx + 1)}
                    style={{ background: 'transparent', border: 'none', color: idx === deliveryPoints.length - 1 ? '#475569' : '#cbd5e1', fontSize: '10px', cursor: idx === deliveryPoints.length - 1 ? 'default' : 'pointer', padding: '0 2px' }}
                  >
                    ▼
                  </button>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => onRemovePoint(idx)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer', padding: '0 4px' }}
                  title="Remove Stop"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
