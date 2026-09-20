from typing import List, Dict, Tuple, Optional
import networkx as nx


class FitnessEvaluator:
    """
    Multi-Objective Fitness Function Evaluator for Transportation Networks.
    F(R) = w1 * T(R) + w2 * D(R) + w3 * C(R) + w4 * O(R) + Penalty(R)

    where:
      - T(R): Total travel time across vehicle routes (minutes)
      - D(R): Total travel distance (km)
      - C(R): Cumulative congestion cost
      - O(R): Fleet operational cost (fuel, wear, driver cost in INR)
      - Penalty(R): Penalty for constraint violations
    """

    DEFAULT_WEIGHTS = {
        'travel_time': 0.35,
        'distance': 0.25,
        'congestion': 0.25,
        'op_cost': 0.15
    }

    def __init__(self, graph_engine, weights: Optional[Dict[str, float]] = None):
        self.graph_engine = graph_engine
        self.weights = weights or dict(self.DEFAULT_WEIGHTS)
        self._normalize_weights()

    def _normalize_weights(self):
        """Ensure sum of weights equals 1.0."""
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}
        else:
            self.weights = dict(self.DEFAULT_WEIGHTS)

    def set_weights(self, weights: Dict[str, float]):
        """Update objective weights."""
        self.weights.update(weights)
        self._normalize_weights()

    def compute_vehicle_times(self, full_routes: List[List[int]]) -> List[float]:
        """Compute travel time individually for each vehicle."""
        v_times = []
        for route in full_routes:
            r_time = 0.0
            for i in range(len(route) - 1):
                u, v = route[i], route[i + 1]
                if u != v:
                    r_time += self._get_edge_attribute(u, v, 'travel_time', default=4.0)
            v_times.append(round(r_time, 2))
        return v_times

    def evaluate(self, full_routes: List[List[int]], penalty: float = 0.0) -> float:
        """
        Evaluate multi-objective fitness for a set of vehicle routes.
        Balances total distance, operational cost, congestion, and fleet makespan (parallel delivery completion time).
        Returns scalar fitness value (lower is better).
        """
        v_times = self.compute_vehicle_times(full_routes)
        active_times = [vt for vt in v_times if vt > 0]
        makespan = max(active_times) if active_times else 0.0
        total_time = sum(active_times)

        # Fleet parallel completion time (makespan) + average travel time
        if len(full_routes) > 1 and active_times:
            effective_time = 0.70 * makespan + 0.30 * (total_time / len(active_times))
        else:
            effective_time = total_time

        d = self.compute_distance(full_routes)
        c = self.compute_congestion_cost(full_routes)
        o = self.compute_op_cost(full_routes)

        w1 = self.weights.get('travel_time', 0.35)
        w2 = self.weights.get('distance', 0.25)
        w3 = self.weights.get('congestion', 0.25)
        w4 = self.weights.get('op_cost', 0.15)

        # Scale metrics into comparable dimensionless magnitudes
        fitness_val = (
            w1 * (effective_time * 1.0) +
            w2 * (d * 1.5) +
            w3 * (c * 20.0) +
            w4 * (o * 0.08)
        ) + penalty

        return max(0.0, float(fitness_val))

    def _get_edge_attribute(self, u: int, v: int, attr: str, default: float) -> float:
        """Helper to get edge attribute safely."""
        if (u, v) in self.graph_engine.edges_data:
            return self.graph_engine.edges_data[(u, v)].get(attr, default)
        elif (v, u) in self.graph_engine.edges_data:
            return self.graph_engine.edges_data[(v, u)].get(attr, default)
        
        # If no direct edge, use shortest path length or default estimate
        try:
            return nx.shortest_path_length(
                self.graph_engine.graph,
                source=u, target=v,
                weight=attr if attr in ['distance', 'travel_time'] else 'weight'
            )
        except Exception:
            return default

    def compute_travel_time(self, full_routes: List[List[int]]) -> float:
        """Calculate total travel time across all vehicle routes."""
        total_time = 0.0
        for route in full_routes:
            for i in range(len(route) - 1):
                u, v = route[i], route[i + 1]
                if u != v:
                    total_time += self._get_edge_attribute(u, v, 'travel_time', default=4.0)
        return round(total_time, 2)

    def compute_distance(self, full_routes: List[List[int]]) -> float:
        """Calculate total distance in kilometers."""
        total_dist = 0.0
        for route in full_routes:
            for i in range(len(route) - 1):
                u, v = route[i], route[i + 1]
                if u != v:
                    total_dist += self._get_edge_attribute(u, v, 'distance', default=2.0)
        return round(total_dist, 2)

    def compute_congestion_cost(self, full_routes: List[List[int]]) -> float:
        """Calculate cumulative congestion index along route segments."""
        total_cong = 0.0
        for route in full_routes:
            for i in range(len(route) - 1):
                u, v = route[i], route[i + 1]
                if u != v:
                    total_cong += self._get_edge_attribute(u, v, 'congestion', default=0.25)
        return round(total_cong, 3)

    def compute_op_cost(self, full_routes: List[List[int]]) -> float:
        """Calculate total fleet operational cost (INR)."""
        total_cost = 0.0
        for route in full_routes:
            for i in range(len(route) - 1):
                u, v = route[i], route[i + 1]
                if u != v:
                    total_cost += self._get_edge_attribute(u, v, 'op_cost', default=25.0)
        return round(total_cost, 2)

    def get_detailed_metrics(self, full_routes: List[List[int]]) -> Dict[str, float]:
        """Return full breakdown of multi-objective metrics."""
        t = self.compute_travel_time(full_routes)
        d = self.compute_distance(full_routes)
        c = self.compute_congestion_cost(full_routes)
        o = self.compute_op_cost(full_routes)
        f = self.evaluate(full_routes)

        return {
            'total_fitness': round(f, 4),
            'travel_time': t,
            'distance': d,
            'congestion_sum': c,
            'op_cost': o,
            'weights': self.weights
        }
