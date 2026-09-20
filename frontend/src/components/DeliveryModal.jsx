import React, { useState } from 'react';
import { searchAddress } from '../services/api';

const PRESETS = {
  delhi: [
    { id: 'd1', name: 'India Gate, New Delhi', lat: 28.6129, lng: 77.2295, demand: 15.0 },
    { id: 'd2', name: 'AIIMS Hospital, Ansari Nagar', lat: 28.5672, lng: 77.2100, demand: 20.0 },
    { id: 'd3', name: 'Karol Bagh Market', lat: 28.6517, lng: 77.1906, demand: 12.0 },
    { id: 'd4', name: 'Lajpat Nagar Central Market', lat: 28.5700, lng: 77.2400, demand: 18.0 }
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

export default function DeliveryModal({
  isOpen,
  onClose,
  depot,
  deliveryPoints,
  onAddPoint,
  onRemovePoint,
  onReorderPoint,
  onClearAll,
  onLoadPreset,
  onOptimize,
  geoStatus,
  onRequestGps
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualDemand, setManualDemand] = useState('15');

  if (!isOpen) return null;

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await searchAddress(searchQuery);
    setSearchResults(results);
    setSearching(false);
  };

  const handleSelectResult = (res) => {
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

  const handleAddManual = (e) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid coordinates.');
      return;
    }
    onAddPoint({
      id: `d_${Date.now()}`,
      name: manualName.trim() || `Stop (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
      lat,
      lng,
      demand: parseFloat(manualDemand) || 15.0
    });
    setManualName('');
    setManualLat('');
    setManualLng('');
    setShowManualForm(false);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.80)',
      backdropFilter: 'blur(6px)',
      zIndex: 9000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        overflow: 'hidden'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#0f172a'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📦</span> Manage Delivery Points
            </h2>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Add destinations via address search, manual coordinates, or direct map click.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Depot Location Banner */}
          <div style={{
            background: '#0f172a',
            border: '1px solid #10b981',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏠</span> Starting Depot (GPS Origin)
              </div>
              <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '2px' }}>
                {depot?.name || 'Current Location'} <span style={{ color: '#94a3b8' }}>({depot?.lat?.toFixed(4)}, {depot?.lng?.toFixed(4)})</span>
              </div>
            </div>
            <button
              onClick={onRequestGps}
              style={{
                background: geoStatus === 'granted' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                border: `1px solid ${geoStatus === 'granted' ? '#10b981' : '#3b82f6'}`,
                color: geoStatus === 'granted' ? '#34d399' : '#60a5fa',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {geoStatus === 'granted' ? '📍 GPS Active' : '📡 Acquire GPS'}
            </button>
          </div>

          {/* Search Address Box */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px', fontWeight: '500' }}>
              Search Place or Address (OpenStreetMap)
            </label>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="e.g. Connaught Place, India Gate, Bandra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#fff',
                  fontSize: '14px'
                }}
              />
              <button
                type="submit"
                disabled={searching}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#3b82f6',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </form>

            {/* Results dropdown */}
            {searchResults.length > 0 && (
              <div style={{
                marginTop: '6px',
                background: '#0f172a',
                border: '1px solid #475569',
                borderRadius: '8px',
                maxHeight: '160px',
                overflowY: 'auto'
              }}>
                {searchResults.map((res, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectResult(res)}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #334155',
                      fontSize: '13px',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <strong>+ {res.short_name}</strong>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{res.name}</div>
                    </div>
                    <span style={{ color: '#10b981', fontSize: '12px', fontWeight: 'bold' }}>+ Add Stop</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual Coordinate Form Toggle */}
          <div>
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#60a5fa',
                fontSize: '12px',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline'
              }}
            >
              {showManualForm ? '▲ Hide Coordinate Inputs' : '▼ Or Enter Exact GPS Coordinates Manually'}
            </button>

            {showManualForm && (
              <form onSubmit={handleAddManual} style={{
                marginTop: '8px',
                background: '#0f172a',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <input
                  type="text"
                  placeholder="Stop Name / Description"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: '13px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number" step="any" placeholder="Latitude (e.g. 28.6129)"
                    value={manualLat} onChange={(e) => setManualLat(e.target.value)} required
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: '13px' }}
                  />
                  <input
                    type="number" step="any" placeholder="Longitude (e.g. 77.2295)"
                    value={manualLng} onChange={(e) => setManualLng(e.target.value)} required
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: '13px' }}
                  />
                  <input
                    type="number" min="1" max="500" placeholder="Demand kg"
                    value={manualDemand} onChange={(e) => setManualDemand(e.target.value)}
                    style={{ width: '90px', padding: '8px', borderRadius: '6px', border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: '13px' }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  + Add Coordinate Stop
                </button>
              </form>
            )}
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Sample Drops:</span>
            {['delhi', 'mumbai', 'bengaluru'].map(city => (
              <button
                key={city}
                onClick={() => onLoadPreset(PRESETS[city])}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#94a3b8',
                  fontSize: '11px',
                  textTransform: 'capitalize',
                  cursor: 'pointer'
                }}
              >
                {city} ({PRESETS[city].length})
              </button>
            ))}
          </div>

          {/* Current Delivery Points List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>
                Delivery List ({deliveryPoints.length} Stops)
              </span>
              {deliveryPoints.length > 0 && (
                <button
                  onClick={onClearAll}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}
                >
                  Clear All
                </button>
              )}
            </div>

            {deliveryPoints.length === 0 ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '13px',
                border: '1px dashed #334155',
                borderRadius: '8px'
              }}>
                No delivery stops added yet.<br/>Search an address above or click anywhere on the live map.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {deliveryPoints.map((pt, idx) => (
                  <div
                    key={pt.id || idx}
                    style={{
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    {/* Numbered Marker Badge */}
                    <span style={{
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      flexShrink: 0
                    }}>
                      D{idx + 1}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {pt.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        GPS: {pt.lat?.toFixed(4)}, {pt.lng?.toFixed(4)} • Package: <strong>{pt.demand || 10} kg</strong>
                      </div>
                    </div>

                    {/* Reorder Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        disabled={idx === 0}
                        onClick={() => onReorderPoint(idx, idx - 1)}
                        style={{ background: 'transparent', border: 'none', color: idx === 0 ? '#334155' : '#cbd5e1', fontSize: '10px', cursor: idx === 0 ? 'default' : 'pointer' }}
                      >
                        ▲
                      </button>
                      <button
                        disabled={idx === deliveryPoints.length - 1}
                        onClick={() => onReorderPoint(idx, idx + 1)}
                        style={{ background: 'transparent', border: 'none', color: idx === deliveryPoints.length - 1 ? '#334155' : '#cbd5e1', fontSize: '10px', cursor: idx === deliveryPoints.length - 1 ? 'default' : 'pointer' }}
                      >
                        ▼
                      </button>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => onRemovePoint(idx)}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '16px', cursor: 'pointer', padding: '0 4px' }}
                      title="Delete Stop"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#0f172a'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#cbd5e1',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>

          <button
            onClick={() => {
              onClose();
              onOptimize();
            }}
            disabled={deliveryPoints.length === 0}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: deliveryPoints.length === 0 ? '#475569' : '#2563eb',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: deliveryPoints.length === 0 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
            }}
          >
            ⚡ Apply & Optimize Route (QPSO)
          </button>
        </div>

      </div>
    </div>
  );
}
