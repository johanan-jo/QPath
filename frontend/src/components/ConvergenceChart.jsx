import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function ConvergenceChart({ convergenceData, algorithmResults }) {
  if (!convergenceData && (!algorithmResults || algorithmResults.length === 0)) {
    return (
      <div className="card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        No convergence data available
      </div>
    );
  }

  let data = [];
  let lines = [];
  const colors = {
    qpso: '#3b82f6',
    pso: '#10b981',
    genetic: '#f59e0b',
    dijkstra: '#ec4899',
    ortools: '#8b5cf6'
  };

  if (algorithmResults && algorithmResults.length > 0) {
    // Determine max length of convergence arrays
    let maxLen = 0;
    algorithmResults.forEach(r => {
      const conv = r.convergence || (r.convergence_data ? r.convergence_data.map(c => c.fitness) : null);
      if (conv && conv.length > maxLen) maxLen = conv.length;
    });

    for (let i = 0; i < maxLen; i++) {
      let pt = { iteration: i };
      algorithmResults.forEach(r => {
        const conv = r.convergence || (r.convergence_data ? r.convergence_data.map(c => c.fitness) : null);
        const name = (r.algorithm || 'algo').toUpperCase();
        if (conv && conv.length > 0) {
          pt[name] = i < conv.length ? conv[i] : conv[conv.length - 1];
        }
      });
      data.push(pt);
    }
    
    algorithmResults.forEach(r => {
      const rawAlgo = (r.algorithm || '').toLowerCase();
      const name = (r.algorithm || 'algo').toUpperCase();
      const conv = r.convergence || (r.convergence_data ? r.convergence_data.map(c => c.fitness) : null);
      if (conv && conv.length > 0) {
        lines.push(<Line key={name} type="monotone" dataKey={name} stroke={colors[rawAlgo] || '#60a5fa'} dot={false} strokeWidth={2} />);
      }
    });
  } else if (convergenceData) {
    const arr = Array.isArray(convergenceData) ? (typeof convergenceData[0] === 'object' ? convergenceData.map(c => c.fitness) : convergenceData) : [];
    data = arr.map((val, i) => ({ iteration: i, QPSO: val }));
    lines.push(<Line key="QPSO" type="monotone" dataKey="QPSO" stroke="#3b82f6" dot={false} strokeWidth={2} name="QPSO Fitness" />);
  }

  return (
    <div className="card" style={{ height: '300px', padding: '16px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Convergence (Fitness vs Iteration)</h3>
      <div style={{ height: '240px', width: '100%' }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="iteration" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }} />
            <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: '12px' }}/>
            {lines}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
