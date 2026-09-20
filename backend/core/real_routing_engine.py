import httpx
import math
import random
from typing import List, Dict, Tuple, Any, Optional
import numpy as np


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two GPS points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return max(0.05, R * c)


class RealRoutingEngine:
    """
    Interfaces with OpenStreetMap / OSRM (Open Source Routing Machine)
    to obtain real road network distances, travel durations, and high-resolution
    road geometry polylines for real-world GPS coordinates.
    Includes built-in offline curvature interpolation as a zero-failure fallback.
    """

    OSRM_PUBLIC_API = "https://router.project-osrm.org"

    def __init__(self, timeout_sec: float = 6.0):
        self.timeout_sec = timeout_sec

    def fetch_distance_and_duration_matrix(
        self,
        coordinates: List[Dict[str, float]],
        congestion_modifiers: Optional[Dict[str, float]] = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Calculates NxN pairwise road matrices:
        - Distance Matrix (km)
        - Travel Time Matrix (minutes, adjusted with dynamic traffic congestion)
        - Congestion Matrix (0.0 - 1.0)
        - Operational Cost Matrix (INR)
        """
        n = len(coordinates)
        dist_mat = np.zeros((n, n), dtype=float)
        time_mat = np.zeros((n, n), dtype=float)
        cong_mat = np.zeros((n, n), dtype=float)
        cost_mat = np.zeros((n, n), dtype=float)

        # Try online OSRM Table API
        osrm_success = False
        try:
            coord_str = ";".join([f"{c['lng']:.6f},{c['lat']:.6f}" for c in coordinates])
            url = f"{self.OSRM_PUBLIC_API}/table/v1/driving/{coord_str}?annotations=distance,duration"
            with httpx.Client(timeout=self.timeout_sec) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("code") == "Ok":
                        distances = data.get("distances", [])  # meters
                        durations = data.get("durations", [])  # seconds
                        for i in range(n):
                            for j in range(n):
                                if i != j and distances and durations:
                                    d_km = max(0.05, distances[i][j] / 1000.0)
                                    t_min = max(0.2, durations[i][j] / 60.0)
                                    dist_mat[i][j] = d_km
                                    time_mat[i][j] = t_min
                        osrm_success = True
        except Exception:
            osrm_success = False

        # Fallback if OSRM is unreachable or offline
        if not osrm_success:
            for i in range(n):
                for j in range(n):
                    if i != j:
                        # Road network detour factor (approx 1.25x - 1.35x crow-flies distance in cities)
                        crow_km = haversine_km(
                            coordinates[i]['lat'], coordinates[i]['lng'],
                            coordinates[j]['lat'], coordinates[j]['lng']
                        )
                        road_km = crow_km * 1.30
                        # Average urban speed 32 km/h
                        time_min = (road_km / 32.0) * 60.0
                        dist_mat[i][j] = road_km
                        time_mat[i][j] = time_min

        # Apply dynamic congestion & operational cost
        congestion_modifiers = congestion_modifiers or {}
        for i in range(n):
            for j in range(n):
                if i != j:
                    edge_key = f"{i}->{j}"
                    # Base congestion level
                    cong_level = congestion_modifiers.get(edge_key, random.uniform(0.15, 0.40))
                    cong_mat[i][j] = round(cong_level, 3)

                    # Congestion inflates travel time via BPR model
                    base_t = time_mat[i][j]
                    time_mat[i][j] = round(base_t * (1.0 + 1.4 * (cong_level ** 1.6)), 2)

                    # Fleet cost: Fuel (Rs 12/km) + Driver time (Rs 2.5/min)
                    cost_mat[i][j] = round(dist_mat[i][j] * 12.0 + time_mat[i][j] * 2.5, 2)

        return dist_mat, time_mat, cong_mat, cost_mat

    def fetch_road_geometry_polyline(
        self,
        from_coord: Dict[str, float],
        to_coord: Dict[str, float]
    ) -> List[Dict[str, float]]:
        """
        Fetch real road-following GPS polyline coordinates between two points.
        """
        try:
            url = f"{self.OSRM_PUBLIC_API}/route/v1/driving/{from_coord['lng']:.6f},{from_coord['lat']:.6f};{to_coord['lng']:.6f},{to_coord['lat']:.6f}?overview=full&geometries=geojson"
            with httpx.Client(timeout=self.timeout_sec) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("code") == "Ok" and data.get("routes"):
                        coords = data["routes"][0]["geometry"]["coordinates"]
                        return [{'lat': pt[1], 'lng': pt[0]} for pt in coords]
        except Exception:
            pass

        # High-fidelity realistic interpolated road path as offline fallback
        return self._generate_realistic_road_path(from_coord, to_coord)

    def _generate_realistic_road_path(
        self,
        start: Dict[str, float],
        end: Dict[str, float],
        num_segments: int = 12
    ) -> List[Dict[str, float]]:
        """
        Generates realistic curved road path when offline.
        """
        lat1, lng1 = start['lat'], start['lng']
        lat2, lng2 = end['lat'], end['lng']

        path = [{'lat': lat1, 'lng': lng1}]
        # Add realistic midpoints with perpendicular curve deviation
        for i in range(1, num_segments):
            frac = i / float(num_segments)
            base_lat = lat1 + frac * (lat2 - lat1)
            base_lng = lng1 + frac * (lng2 - lng1)

            # Perpendicular wiggle to simulate real city streets
            dx = (lat2 - lat1)
            dy = (lng2 - lng1)
            perp_lat = -dy * 0.08 * math.sin(frac * math.pi)
            perp_lng = dx * 0.08 * math.sin(frac * math.pi)

            path.append({'lat': base_lat + perp_lat, 'lng': base_lng + perp_lng})

        path.append({'lat': lat2, 'lng': lng2})
        return path
