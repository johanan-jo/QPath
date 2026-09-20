import asyncio
import random
import time
from typing import Dict, List, Callable, Tuple, Any, Optional
from datetime import datetime


class TrafficSimulator:
    """
    Dynamic Traffic Simulation Module.
    Models time-varying traffic congestion and sudden incident shocks across the road network.
    """

    PRESETS = {
        'free_flow': {'factor': 0.35, 'noise': 0.05, 'incident_prob': 0.0},
        'moderate': {'factor': 1.0, 'noise': 0.10, 'incident_prob': 0.02},
        'heavy': {'factor': 1.65, 'noise': 0.15, 'incident_prob': 0.05},
        'incident': {'factor': 1.2, 'noise': 0.15, 'incident_prob': 0.20},
        'gridlock': {'factor': 2.2, 'noise': 0.10, 'incident_prob': 0.10}
    }

    def __init__(self, graph_engine):
        self.graph_engine = graph_engine
        self.current_hour = datetime.now().hour
        self.incident_edges: Dict[Tuple[int, int], float] = {}  # edge -> severity
        self.subscribers: List[Callable] = []
        self._running: bool = False
        self.preset: str = "moderate"

    def get_time_of_day_multiplier(self, hour: int) -> float:
        """
        Diurnal traffic profile:
        - Morning Peak (8 AM - 10 AM): 1.8x
        - Evening Peak (5 PM - 8 PM): 2.0x
        - Midday (11 AM - 4 PM): 1.1x
        - Night (11 PM - 6 AM): 0.5x
        """
        if 8 <= hour <= 10:
            return 1.8
        elif 17 <= hour <= 20:
            return 2.0
        elif 11 <= hour <= 16:
            return 1.1
        elif 23 <= hour or hour <= 6:
            return 0.5
        else:
            return 1.0

    def set_preset(self, preset: str):
        """Set traffic simulation preset."""
        preset_key = preset.lower()
        if preset_key in self.PRESETS:
            self.preset = preset_key
        else:
            self.preset = "moderate"

    def simulate_step(self) -> Dict[str, Any]:
        """
        Advance simulation by one time-step:
        Updates edge congestion values using time-of-day multipliers and presets.
        """
        if not self.graph_engine.graph:
            return {}

        cfg = self.PRESETS.get(self.preset, self.PRESETS['moderate'])
        tod_mult = self.get_time_of_day_multiplier(self.current_hour)
        overall_factor = cfg['factor'] * tod_mult

        congestion_map = {}
        for edge, data in self.graph_engine.edges_data.items():
            if edge in self.incident_edges:
                # Severe incident congestion
                congestion = self.incident_edges[edge]
            else:
                base_c = random.uniform(0.12, 0.38)
                jitter = random.uniform(-cfg['noise'], cfg['noise'])
                congestion = max(0.05, min(0.98, base_c * overall_factor + jitter))

            congestion_map[edge] = congestion

        self.graph_engine.update_congestion(congestion_map)
        return self.get_traffic_state()

    def inject_incident(self, edge: Tuple[int, int], severity: float = 0.95):
        """Inject a localized road incident / blockage on an edge."""
        u, v = edge
        if edge in self.graph_engine.edges_data or (u, v) in self.graph_engine.edges_data:
            self.incident_edges[edge] = min(1.0, max(0.6, severity))
            self.graph_engine.update_congestion({edge: severity})
            # If bidirectional, block reverse too
            if (v, u) in self.graph_engine.edges_data:
                self.incident_edges[(v, u)] = min(1.0, max(0.6, severity))
                self.graph_engine.update_congestion({(v, u): severity})

    def clear_incident(self, edge: Tuple[int, int]):
        """Clear an active incident from an edge."""
        u, v = edge
        self.incident_edges.pop(edge, None)
        self.incident_edges.pop((v, u), None)
        # Restore normal congestion
        if edge in self.graph_engine.edges_data:
            self.graph_engine.update_congestion({edge: 0.25})
        if (v, u) in self.graph_engine.edges_data:
            self.graph_engine.update_congestion({(v, u): 0.25})

    def clear_all_incidents(self):
        """Clear all active incidents."""
        self.incident_edges.clear()
        self.simulate_step()

    def get_traffic_state(self) -> Dict[str, Any]:
        """Return serializable traffic status."""
        incidents_list = [
            {'source': u, 'target': v, 'severity': sev}
            for (u, v), sev in self.incident_edges.items()
        ]

        # Sample edge congestion summary
        edge_congestion = {
            f"{u}->{v}": d['congestion']
            for (u, v), d in self.graph_engine.edges_data.items()
        }

        avg_congestion = (
            sum(d['congestion'] for d in self.graph_engine.edges_data.values()) /
            max(1, len(self.graph_engine.edges_data))
        ) if self.graph_engine.edges_data else 0.0

        return {
            'hour': self.current_hour,
            'preset': self.preset,
            'average_congestion': round(avg_congestion, 3),
            'incident_count': len(self.incident_edges),
            'incidents': incidents_list,
            'edge_congestion': edge_congestion
        }

    async def run_simulation_loop(self, interval_seconds: float = 5.0):
        """Background asynchronous loop broadcasting traffic updates to subscribers."""
        self._running = True
        while self._running:
            state = self.simulate_step()
            for cb in list(self.subscribers):
                try:
                    if asyncio.iscoroutinefunction(cb):
                        await cb(state)
                    else:
                        cb(state)
                except Exception:
                    pass
            await asyncio.sleep(interval_seconds)

    def stop_simulation(self):
        self._running = False

    def subscribe(self, callback: Callable):
        if callback not in self.subscribers:
            self.subscribers.append(callback)

    def unsubscribe(self, callback: Callable):
        if callback in self.subscribers:
            self.subscribers.remove(callback)
