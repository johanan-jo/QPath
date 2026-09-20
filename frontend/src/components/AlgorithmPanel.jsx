import React from 'react';

export default function AlgorithmPanel({ loading, activeAlgorithm, results }) {
  const algos = ['QPSO', 'PSO', 'GA', 'Dijkstra', 'OR-Tools'];
  
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '8px', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
      {algos.map(alg => {
        let status = 'pending';
        let color = '#64748b';
        
        const algKey = alg.toLowerCase().replace('-', '');
        const isMatched = results?.some(r => {
          const rKey = (r.algorithm || '').toLowerCase().replace('-', '');
          return rKey === algKey || rKey === alg.toLowerCase();
        });
        const isRunning = loading && (
          activeAlgorithm?.toLowerCase().replace('-', '') === algKey || 
          activeAlgorithm === 'comparing' ||
          activeAlgorithm === 'Comparing...'
        );

        if (isMatched) {
          status = 'done';
          color = '#10b981';
        } else if (isRunning) {
          status = 'running';
          color = '#3b82f6';
        }

        return (
          <div key={alg} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', fontSize: '12px', color, border: `1px solid ${color}` }}>
            {status === 'running' && <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', background: color, animation: 'pulse 1s infinite' }}/>}
            {status === 'done' && <span>✓</span>}
            {alg}
          </div>
        );
      })}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
