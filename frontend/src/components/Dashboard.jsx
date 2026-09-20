import React from 'react';

const MetricCard = ({ icon, title, value, unit, color }) => (
  <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px', flex: '1', minWidth: '150px' }}>
    <div style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
      <span style={{ fontSize: '16px' }}>{icon}</span> {title}
    </div>
    <div style={{ fontSize: '24px', fontWeight: 'bold', color: color || '#f8fafc' }}>
      {value} <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#64748b' }}>{unit}</span>
    </div>
  </div>
);

export default function Dashboard({ result, comparison }) {
  if (!result && (!comparison || comparison.length === 0)) {
    return (
      <div className="card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        Run optimization or comparison to see metrics
      </div>
    );
  }

  // Use best result from comparison if array, else use single result
  let best = result;
  if (comparison && comparison.length > 0) {
    best = comparison.find(r => r.algorithm?.toLowerCase() === 'qpso') || comparison[0];
  }
  
  if (!best) return null;

  const isQpso = best.algorithm?.toLowerCase() === 'qpso';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Key Metrics</h2>
        {isQpso && (
          <span style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #3b82f6' }}>
            ✨ QPSO Near-optimal solution
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <MetricCard icon="🏎" title="Algorithm" value={best.algorithm?.toUpperCase()} color="#60a5fa" />
        <MetricCard icon="⏱" title="Travel Time" value={best.total_travel_time?.toFixed(1)} unit="min" />
        <MetricCard icon="📏" title="Distance" value={best.total_distance?.toFixed(2)} unit="km" />
        <MetricCard icon="🚦" title="Congestion" value={best.total_congestion?.toFixed(2)} unit="cost" />
        <MetricCard icon="💰" title="Operational Cost" value={best.total_op_cost?.toFixed(0)} unit="INR" />
        <MetricCard icon="🔄" title="Iterations" value={best.convergence?.length || best.metrics?.convergence_iterations || '-'} unit="steps" />
      </div>
    </div>
  );
}
