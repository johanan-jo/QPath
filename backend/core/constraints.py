from typing import List, Dict, Tuple, Any, Optional
from dataclasses import dataclass, field


@dataclass
class ConstraintConfig:
    """Configuration parameters for VRP constraints."""
    vehicle_capacity: float = 100.0
    max_route_distance: float = 100.0   # km per vehicle
    max_route_time: float = 240.0       # minutes per vehicle (4 hours)
    capacity_penalty_weight: float = 1000.0
    distance_penalty_weight: float = 50.0
    time_penalty_weight: float = 20.0


@dataclass
class FeasibilityReport:
    """Detailed report on route feasibility and constraint compliance."""
    is_feasible: bool
    total_violations: int
    capacity_violations: List[Dict[str, Any]] = field(default_factory=list)
    distance_violations: List[Dict[str, Any]] = field(default_factory=list)
    time_violations: List[Dict[str, Any]] = field(default_factory=list)
    total_penalty: float = 0.0
    summary_reason: str = "Feasible"


class ConstraintHandler:
    """
    Validates and penalizes route constraint violations:
    1. Vehicle Capacity: sum(demands in route) <= vehicle_capacity
    2. Max Route Distance: sum(distance in route) <= max_route_distance
    3. Max Route Travel Time: sum(travel_time in route) <= max_route_time
    """

    def __init__(self, config: Optional[ConstraintConfig] = None):
        self.config = config or ConstraintConfig()

    def evaluate_constraints(
        self,
        routes: List[List[int]],
        demands: Dict[int, float],
        graph_engine
    ) -> FeasibilityReport:
        """
        Evaluate full set of constraints across all vehicle routes.
        """
        report = FeasibilityReport(is_feasible=True, total_violations=0)
        total_penalty = 0.0
        reasons = []

        for v_idx, route in enumerate(routes):
            # 1. Capacity constraint
            load = sum(demands.get(n, 0.0) for n in route)
            if load > self.config.vehicle_capacity:
                excess = load - self.config.vehicle_capacity
                penalty = excess * self.config.capacity_penalty_weight
                total_penalty += penalty
                report.capacity_violations.append({
                    'vehicle': v_idx,
                    'load': load,
                    'capacity': self.config.vehicle_capacity,
                    'excess': excess,
                    'penalty': penalty
                })
                report.is_feasible = False
                report.total_violations += 1
                reasons.append(f"Vehicle {v_idx} capacity exceeded ({load:.1f} > {self.config.vehicle_capacity})")

            # 2. Distance and time constraints along edges
            route_dist = 0.0
            route_time = 0.0
            for i in range(len(route) - 1):
                u, v = route[i], route[i + 1]
                if u != v:
                    edge_data = graph_engine.edges_data.get((u, v)) or graph_engine.edges_data.get((v, u))
                    if edge_data:
                        route_dist += edge_data.get('distance', 1.0)
                        route_time += edge_data.get('travel_time', 2.0)
                    else:
                        route_dist += 2.0
                        route_time += 4.0

            if route_dist > self.config.max_route_distance:
                excess = route_dist - self.config.max_route_distance
                penalty = excess * self.config.distance_penalty_weight
                total_penalty += penalty
                report.distance_violations.append({
                    'vehicle': v_idx,
                    'distance': route_dist,
                    'max_distance': self.config.max_route_distance,
                    'excess': excess,
                    'penalty': penalty
                })
                report.is_feasible = False
                report.total_violations += 1
                reasons.append(f"Vehicle {v_idx} max distance exceeded ({route_dist:.1f} > {self.config.max_route_distance})")

            if route_time > self.config.max_route_time:
                excess = route_time - self.config.max_route_time
                penalty = excess * self.config.time_penalty_weight
                total_penalty += penalty
                report.time_violations.append({
                    'vehicle': v_idx,
                    'travel_time': route_time,
                    'max_time': self.config.max_route_time,
                    'excess': excess,
                    'penalty': penalty
                })
                report.is_feasible = False
                report.total_violations += 1
                reasons.append(f"Vehicle {v_idx} max time exceeded ({route_time:.1f} > {self.config.max_route_time})")

        report.total_penalty = total_penalty
        report.summary_reason = "; ".join(reasons) if reasons else "Feasible"
        return report

    def compute_penalty(
        self,
        routes: List[List[int]],
        demands: Dict[int, float],
        graph_engine
    ) -> float:
        """Fast penalty evaluation during optimization loop."""
        report = self.evaluate_constraints(routes, demands, graph_engine)
        return report.total_penalty
