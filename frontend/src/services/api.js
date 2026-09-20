import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

const api = axios.create({ baseURL: API_BASE, timeout: 60000 });

// Attach JWT Bearer token if present in localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('qpath_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// ---------------- Authentication Endpoints ----------------
export const loginUser = (username, password) =>
  api.post('/auth/login', { username, password });

export const getMe = () =>
  api.get('/auth/me');

// ---------------- Complete Driver Workflow Endpoints ----------------
export const getAvailableJobs = () =>
  api.get('/driver/available-jobs');

export const getDriverView = (driverId) =>
  api.get(`/driver/${driverId}/view`);

export const acceptJob = (driverId, jobId, driverGps) =>
  api.post('/driver/accept-job', { driver_id: driverId, job_id: jobId, driver_gps: driverGps });

export const completeDelivery = (driverId, jobId, stopId, driverGps) =>
  api.post('/driver/complete-delivery', { driver_id: driverId, job_id: jobId, stop_id: stopId, driver_gps: driverGps });

export const failDelivery = (driverId, jobId, stopId, reason, driverGps) =>
  api.post('/driver/fail-delivery', { driver_id: driverId, job_id: jobId, stop_id: stopId, reason, driver_gps: driverGps });

export const completeReturnToHub = (driverId, jobId, driverGps) =>
  api.post('/driver/complete-return', { driver_id: driverId, job_id: jobId, driver_gps: driverGps });

export const verifyReturnAtHub = (jobId) =>
  api.post('/admin/verify-return', { job_id: jobId });

export const releaseDriver = (driverId) =>
  api.post('/driver/release', { driver_id: driverId });


export const getDriverAssignedRoute = (driverId) =>
  api.get(`/driver/${driverId}/assigned-route`);

export const updateDeliveryStatus = (driverId, stopId, status) =>
  api.post('/driver/update-status', { driver_id: driverId, stop_id: stopId, status });

// ---------------- Admin Real-Time Fleet Endpoints ----------------
export const getAdminFleetLive = () =>
  api.get('/admin/fleet-live');

export const getAdminDispatchOverview = () =>
  api.get('/admin/fleet-live');

export const publishAdminJob = (jobData) =>
  api.post('/admin/publish-job', jobData);

// ---------------- Routing & Optimization Endpoints ----------------
export const getGraph = (city = 'delhi', numNodes = 50) =>
  api.get(`/graph?city=${city}&num_nodes=${numNodes}`);

export const optimize = (params) =>
  api.post('/optimize', params);

export const compareAlgorithms = (params) =>
  api.post('/compare', params);

export const getTraffic = () =>
  api.get('/traffic');

export const updateTraffic = (data) =>
  api.post('/traffic/update', data);

export const checkHealth = () =>
  api.get('/health');

export const optimizeRealRoute = (params) =>
  api.post('/real-route/optimize', params);

export const compareRealRoute = (params) =>
  api.post('/real-route/compare', params);

// Free OpenStreetMap Nominatim Geocoding API for address search
export const searchAddress = async (query) => {
  if (!query || query.trim().length < 2) return [];
  try {
    const resp = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        format: 'json',
        q: query,
        addressdetails: 1,
        limit: 5
      },
      headers: {
        'Accept-Language': 'en'
      }
    });
    return resp.data.map(item => ({
      name: item.display_name,
      short_name: item.name || item.display_name.split(',')[0],
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon)
    }));
  } catch (err) {
    console.warn('Nominatim geocoding error:', err);
    return [];
  }
};

// ---------------- OTP & Customer Delivery Endpoints ----------------

// Admin: Generate OTP for a delivery stop (returns plaintext OTP + customer token)
export const generateOTPForStop = (stopId, customerName = 'Customer') =>
  api.post('/admin/generate-otp', { stop_id: stopId, customer_name: customerName });

// Driver: Submit customer's OTP to verify delivery
export const verifyDeliveryOTP = (stopId, otp, driverId, driverGps = null) =>
  api.post('/driver/verify-otp', { stop_id: stopId, otp, driver_id: driverId, driver_gps: driverGps });

// Customer: Get their delivery status using unique token (no auth required)
export const getCustomerDeliveryStatus = (token) =>
  axios.get(`${API_BASE}/customer/delivery-status`, { params: { token } });

// Customer: Request a new OTP (no auth required, rate-limited)
export const customerRegenerateOTP = (deliveryToken) =>
  axios.post(`${API_BASE}/customer/regenerate-otp`, { delivery_token: deliveryToken });

// Admin: Get OTP verification table (status only, no actual OTPs)
export const getAdminOTPVerificationTable = () =>
  api.get('/admin/otp-verification-table');

export default api;
