import React from 'react';

export default function TrafficLegend({ trafficState, wsConnected }) {
  return (
    <div style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 1000, background: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid #334155', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '6px', marginBottom: '2px' }}>
        <span>Traffic Levels</span>
        <span title={wsConnected ? "WebSocket Connected" : "WebSocket Disconnected"} style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: wsConnected ? '#22c55e' : '#ef4444' }}/>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
        <div style={{ width: '16px', height: '4px', background: '#22c55e' }}></div> Low (&lt;0.3)
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
        <div style={{ width: '16px', height: '4px', background: '#f59e0b' }}></div> Moderate (0.3-0.6)
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
        <div style={{ width: '16px', height: '4px', background: '#ef4444' }}></div> Heavy (&gt;0.6)
      </div>
      {trafficState?.preset && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
          Current Preset: <span style={{ color: '#fff' }}>{trafficState.preset}</span>
        </div>
      )}
    </div>
  );
}
