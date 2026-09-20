import networkx as nx
from typing import List, Dict, Optional, Any, Set
from optimizers.base import BaseOptimizer
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator


class DijkstraOptimizer(BaseOptimizer):
    """
    Dijkstra-based Greedy Multi-Vehicle Routing baseline.
    Uses NetworkX shortest path distance/travel time to greedily route vehicles to nearest
    unvisited delivery destinations while respecting vehicle capacities.
    """

    def __init__(self):
        super().__init__(name="Dijkstra")

    def optimize(
        self,
        vrp: VRPFormulation,
        fitness_evaluator: FitnessEvaluator,
        dim: Optional[int] = None
    ) -> Dict[str, Any]:
        self.metrics.start_timer()

        unvisited: Set[int] = set(vrp.delivery_nodes)
        routes: List[List[int]] = [[] for _ in range(vrp.num_vehicles)]

        if not unvisited:
            self.metrics.stop_timer()
            empty_routes = vrp.get_route_nodes(routes)
            return self._format_result(
                best_routes=empty_routes,
                best_fitness=0.0,
                fitness_evaluator=fitness_evaluator,
                vrp=vrp,
                convergence_data=[{'iteration': 0, 'fitness': 0.0}]
            )

        import math
        target_stops_per_vehicle = max(1, math.ceil(len(vrp.delivery_nodes) / vrp.num_vehicles))

        # Greedy nearest neighbor per vehicle
        for v_idx in range(vrp.num_vehicles):
            current_node = vrp.depot_node
            current_load = 0.0
            stops_assigned = 0

            while unvisited:
                nearest_node = self._find_nearest_unvisited(
                    vrp.graph_engine.graph,
                    current_node,
                    unvisited
                )

                if nearest_node is None:
                    break

                demand = vrp.demands.get(nearest_node, 10.0)
                # Check capacity before assigning
                if current_load + demand > vrp.vehicle_capacity and v_idx < vrp.num_vehicles - 1:
                    break

                # If other vehicles still need stops and this vehicle reached target quota, advance to next vehicle
                remaining_vehicles = vrp.num_vehicles - 1 - v_idx
                if remaining_vehicles > 0 and stops_assigned >= target_stops_per_vehicle and len(unvisited) >= remaining_vehicles:
                    break

                routes[v_idx].append(nearest_node)
                unvisited.remove(nearest_node)
                current_load += demand
                current_node = nearest_node
                stops_assigned += 1

        # Distribute any remaining deliveries to the vehicle with lowest load that has capacity
        if unvisited:
            for remaining in list(unvisited):
                demand = vrp.demands.get(remaining, 10.0)
                v_loads = [sum(vrp.demands.get(n, 10.0) for n in routes[v]) for v in range(vrp.num_vehicles)]
                best_v = int(np.argmin(v_loads))
                routes[best_v].append(remaining)

        self.metrics.stop_timer()

        full_routes = vrp.get_route_nodes(routes)
        penalty = vrp.compute_penalty(routes)
        fit = fitness_evaluator.evaluate(full_routes, penalty)

        convergence_data = [{'iteration': 0, 'fitness': float(fit)}]
        self.metrics.record_iteration(0, float(fit))

        return self._format_result(
            best_routes=full_routes,
            best_fitness=fit,
            fitness_evaluator=fitness_evaluator,
            vrp=vrp,
            convergence_data=convergence_data
        )

    def _find_nearest_unvisited(
        self,
        graph: nx.DiGraph,
        current_node: int,
        unvisited: Set[int]
    ) -> Optional[int]:
        """Find the unvisited delivery node with minimum Dijkstra travel time from current node."""
        best_time = float('inf')
        best_target = None

        for candidate in unvisited:
            try:
                travel_time = nx.shortest_path_length(
                    graph,
                    source=current_node,
                    target=candidate,
                    weight='travel_time'
                )
                if travel_time < best_time:
                    best_time = travel_time
                    best_target = candidate
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue

        # Fallback to any unvisited if graph disconnected
        if best_target is None and unvisited:
            best_target = next(iter(unvisited))

        return best_target
