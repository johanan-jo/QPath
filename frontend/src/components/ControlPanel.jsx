import React from 'react';

const blockStyle = { marginBottom: '16px' };
const labelStyle = { display: 'block', fontSize: '14px', marginBottom: '4px', color: '#94a3b8' };
const inputStyle = { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #475569', background: '#334155', color: '#fff', fontSize: '14px' };
const buttonStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: 'none', background: '#334155', color: '#fff', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' };
const primaryButtonStyle = { ...buttonStyle, background: '#3b82f6' };

export default function ControlPanel({ params, setParams, onLoadGraph, onOptimize, onCompare, loading, graphLoaded }) {
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;
    if (type === 'range' || type === 'number') val = Number(val);
    setParams({ ...params, [name]: val });
  };

  const handleWeightChange = (e) => {
    const { name, value } = e.target;
    setParams({
      ...params,
      weights: { ...params.weights, [name]: Number(value) }
    });
  };

  const handleAlgorithmToggle = (alg) => {
    const algs = params.algorithms || [];
    if (algs.includes(alg)) {
      setParams({ ...params, algorithms: algs.filter(a => a !== alg) });
    } else {
      setParams({ ...params, algorithms: [...algs, alg] });
    }
  };

  return (
    <div className="card" style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>Settings</h2>
      
      <div style={blockStyle}>
        <label style={labelStyle}>City</label>
        <select name="city" value={params.city} onChange={handleChange} style={inputStyle}>
          <option value="delhi">Delhi</option>
          <option value="mumbai">Mumbai</option>
          <option value="bengaluru">Bengaluru</option>
        </select>
      </div>

      <div style={blockStyle}>
        <label style={labelStyle}>Number of Nodes ({params.numNodes})</label>
        <input type="range" name="numNodes" min="20" max="200" step="10" value={params.numNodes} onChange={handleChange} style={{width: '100%'}}/>
      </div>
      
      <button style={buttonStyle} onClick={onLoadGraph} disabled={loading}>
        {loading && !graphLoaded ? 'Loading...' : 'Load Network'}
      </button>

      <div style={{ display: 'flex', gap: '8px', ...blockStyle, marginTop: '16px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Source Node</label>
          <input type="number" name="sourceNode" value={params.sourceNode} onChange={handleChange} style={inputStyle} min="0" max={params.numNodes-1} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Dest Node (Opt)</label>
          <input type="number" name="destNode" value={params.destNode === null ? '' : params.destNode} onChange={(e) => setParams({...params, destNode: e.target.value === '' ? null : Number(e.target.value)})} style={inputStyle} min="0" max={params.numNodes-1} placeholder="Any" />
        </div>
      </div>

      <div style={blockStyle}>
        <label style={labelStyle}>Vehicles ({params.numVehicles}) | Capacity ({params.vehicleCapacity}) | Deliveries ({params.numDeliveries})</label>
        <div style={{display:'flex', gap:'8px', marginTop:'4px'}}>
          <input type="range" name="numVehicles" min="1" max="10" value={params.numVehicles} onChange={handleChange} style={{flex:1}} title="Vehicles"/>
          <input type="range" name="vehicleCapacity" min="50" max="500" step="10" value={params.vehicleCapacity} onChange={handleChange} style={{flex:1}} title="Capacity"/>
          <input type="range" name="numDeliveries" min="5" max="30" value={params.numDeliveries} onChange={handleChange} style={{flex:1}} title="Deliveries"/>
        </div>
      </div>

      <div style={blockStyle}>
        <label style={labelStyle}>Objective Weights</label>
        <div style={{fontSize:'12px', color:'#cbd5e1', marginBottom:'4px'}}>W1: Time({params.weights.w1}) W2: Dist({params.weights.w2}) W3: Cong({params.weights.w3}) W4: Cost({params.weights.w4})</div>
        <input type="range" name="w1" min="0" max="1" step="0.05" value={params.weights.w1} onChange={handleWeightChange} style={{width:'100%'}}/>
        <input type="range" name="w2" min="0" max="1" step="0.05" value={params.weights.w2} onChange={handleWeightChange} style={{width:'100%'}}/>
        <input type="range" name="w3" min="0" max="1" step="0.05" value={params.weights.w3} onChange={handleWeightChange} style={{width:'100%'}}/>
        <input type="range" name="w4" min="0" max="1" step="0.05" value={params.weights.w4} onChange={handleWeightChange} style={{width:'100%'}}/>
      </div>

      <div style={blockStyle}>
        <label style={labelStyle}>Algorithms</label>
        <div style={{display:'flex', flexWrap:'wrap', gap:'8px'}}>
          {['QPSO', 'PSO', 'GA', 'Dijkstra', 'OR-Tools'].map(alg => (
            <label key={alg} style={{fontSize:'14px', display:'flex', alignItems:'center', gap:'4px'}}>
              <input type="checkbox" checked={params.algorithms?.includes(alg) || false} onChange={() => handleAlgorithmToggle(alg)} />
              {alg}
            </label>
          ))}
        </div>
      </div>

      <div style={blockStyle}>
        <label style={labelStyle}>QPSO Params</label>
        <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
          <input type="number" name="numParticles" value={params.numParticles} onChange={handleChange} style={inputStyle} min="10" max="100" title="Particles"/>
          <span style={{fontSize:'12px'}}>P</span>
          <input type="number" name="maxIterations" value={params.maxIterations} onChange={handleChange} style={inputStyle} min="50" max="500" title="Iterations"/>
          <span style={{fontSize:'12px'}}>Iters</span>
        </div>
      </div>

      <div style={{marginTop: 'auto'}}>
        <button style={primaryButtonStyle} onClick={onOptimize} disabled={loading || !graphLoaded}>
          {loading ? 'Optimizing...' : 'Optimize Routes'}
        </button>
        <button style={buttonStyle} onClick={onCompare} disabled={loading || !graphLoaded}>
          Compare All
        </button>
      </div>
    </div>
  );
}
