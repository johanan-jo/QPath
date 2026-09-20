import { useState, useEffect, useRef, useCallback } from 'react';
import { getTraffic, updateTraffic } from '../services/api';

export const useTraffic = () => {
  const [trafficState, setTrafficState] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  const fetchTraffic = useCallback(async () => {
    try {
      const resp = await getTraffic();
      setTrafficState(resp.data);
    } catch (e) {
      console.warn('Traffic fetch failed:', e.message);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket('ws://localhost:8000/ws/traffic');
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'traffic_update') setTrafficState(msg.data);
      };
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWebSocket, 5000); // reconnect
      };
      wsRef.current = ws;
    } catch (e) {
      console.warn('WebSocket not available');
    }
  }, []);

  useEffect(() => {
    fetchTraffic();
    connectWebSocket();
    return () => wsRef.current?.close();
  }, [fetchTraffic, connectWebSocket]);

  const applyPreset = useCallback(async (preset) => {
    await updateTraffic({ preset });
    await fetchTraffic();
  }, [fetchTraffic]);

  return { trafficState, wsConnected, applyPreset, fetchTraffic };
};
