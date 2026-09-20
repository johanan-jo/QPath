import { useState, useEffect, useCallback, useRef } from 'react';

// Default fallback locations
const DEFAULT_LOCATIONS = {
  delhi: { lat: 28.6139, lng: 77.2090, name: "Current Location (Delhi Center)" },
  mumbai: { lat: 19.0760, lng: 72.8777, name: "Current Location (Mumbai Center)" },
  bengaluru: { lat: 12.9716, lng: 77.5946, name: "Current Location (Bengaluru Center)" }
};

export const useGeolocation = (defaultCity = 'delhi') => {
  // Check localStorage for previously saved real GPS coordinates
  const savedGps = (() => {
    try {
      const saved = localStorage.getItem('qpath_user_gps');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })();

  const [coords, setCoords] = useState(savedGps || DEFAULT_LOCATIONS[defaultCity] || DEFAULT_LOCATIONS.delhi);
  const [accuracy, setAccuracy] = useState(null);
  const [status, setStatus] = useState(savedGps ? 'granted' : 'prompt'); // 'prompt' | 'granted' | 'denied' | 'error'
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLiveGps, setIsLiveGps] = useState(Boolean(savedGps));
  const hasRequestedRef = useRef(false);

  // Fast IP-based geolocation fallback while GPS resolves
  const fetchIpLocation = useCallback(async () => {
    if (savedGps) return;
    try {
      const res = await fetch('https://ipapi.co/json/', { timeout: 3000 });
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          const ipLoc = {
            lat: data.latitude,
            lng: data.longitude,
            name: `Current Location (${data.city || 'My City'}, ${data.region_code || ''})`
          };
          setCoords(prev => (prev === DEFAULT_LOCATIONS.delhi ? ipLoc : prev));
        }
      }
    } catch (e) {
      // Ignore IP fallback error
    }
  }, [savedGps]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setErrorMsg('Geolocation is not supported by this browser.');
      fetchIpLocation();
      return;
    }

    setStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          name: "My GPS Depot Location"
        };
        setCoords(newCoords);
        setAccuracy(position.coords.accuracy);
        setStatus('granted');
        setIsLiveGps(true);
        setErrorMsg(null);
        try {
          localStorage.setItem('qpath_user_gps', JSON.stringify(newCoords));
        } catch {}
      },
      (error) => {
        console.warn('Geolocation access error:', error.message);
        setStatus('denied');
        setErrorMsg(error.message);
        fetchIpLocation();
        setIsLiveGps(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  }, [fetchIpLocation]);

  useEffect(() => {
    if (!hasRequestedRef.current) {
      hasRequestedRef.current = true;
      requestLocation();
    }
  }, [requestLocation]);

  const setManualLocation = (newLat, newLng, name = "Custom Depot") => {
    const loc = { lat: parseFloat(newLat), lng: parseFloat(newLng), name };
    setCoords(loc);
    setIsLiveGps(false);
    setStatus('manual');
    try {
      localStorage.setItem('qpath_user_gps', JSON.stringify(loc));
    } catch {}
  };

  return {
    coords,
    accuracy,
    status,
    errorMsg,
    isLiveGps,
    requestLocation,
    setManualLocation
  };
};
