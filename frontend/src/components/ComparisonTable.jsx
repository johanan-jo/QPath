import React from 'react';

export default function ComparisonTable({ comparison }) {
  if (!comparison || comparison.length === 0) return null;

  const thStyle = { padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' };
  const tdStyle = { padding: '12px 16px', borderBottom: '1px solid #1e293b', fontSize: '14px' };

  const baseline = comparison.find(c => c.algorithm !== 'QPSO') || comparison[0];

  return (
    <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #334155' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Algorithm Comparison</h3>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Algorithm</th>
            <th style={thStyle}>Travel Time (m)</th>
            <th style={thStyle}>Distance (km)</th>
            <th style={thStyle}>Congestion</th>
            <th style={thStyle}>Op. Cost (₹)</th>
            <th style={thStyle}>Compute (s)</th>
            <th style={thStyle}>Iterations</th>
            <th style={thStyle}>Fitness</th>
          </tr>
        </thead>
        <tbody>
          {comparison.map((row, idx) => {
            const isQpso = row.algorithm?.toLowerCase() === 'qpso';
            const highlightStyle = isQpso ? { background: 'rgba(59, 130, 246, 0.1)', fontWeight: 'bold' } : {};
            const algoName = (row.algorithm || `Algo ${idx+1}`).toUpperCase();
            
            return (
              <tr key={row.algorithm || idx} style={highlightStyle}>
                <td style={{...tdStyle, color: isQpso ? '#60a5fa' : '#e2e8f0'}}>{algoName}</td>
                <td style={tdStyle}>{row.total_travel_time != null ? Number(row.total_travel_time).toFixed(2) : '-'}</td>
                <td style={tdStyle}>{row.total_distance != null ? Number(row.total_distance).toFixed(2) : '-'}</td>
                <td style={tdStyle}>{row.total_congestion != null ? Number(row.total_congestion).toFixed(2) : '-'}</td>
                <td style={tdStyle}>{row.total_op_cost != null ? Number(row.total_op_cost).toFixed(2) : '-'}</td>
                <td style={tdStyle}>{row.compute_time != null ? Number(row.compute_time).toFixed(3) : '-'}</td>
                <td style={tdStyle}>{row.convergence?.length || row.metrics?.convergence_iterations || '-'}</td>
                <td style={tdStyle}>{row.fitness != null ? Number(row.fitness).toFixed(4) : (row.best_fitness != null ? Number(row.best_fitness).toFixed(4) : '-')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
