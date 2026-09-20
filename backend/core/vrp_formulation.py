import numpy as np
import random
from typing import List, Dict, Tuple, Optional
from core.constraints import ConstraintHandler, ConstraintConfig, FeasibilityReport


class VRPFormulation:
    """
    Vehicle Routing Problem (VRP) formulation.
    Handles encoding, decoding, demand assignments, and constraint validation
    for metaheuristic and heuristic optimizers.
    """

    def __init__(
        self,
        graph_engine,
        num_vehicles: int = 3,
        vehicle_capacity: float = 100.0,
        depot_node: int = 0,
        constraint_config: Optional[ConstraintConfig] = None
    ):
        self.graph_engine = graph_engine
        self.num_vehicles = max(1, num_vehicles)
        self.vehicle_capacity = float(vehicle_capacity)
        self.depot_node = depot_node
        self.delivery_nodes: List[int] = []
        self.demands: Dict[int, float] = {}

        # Setup constraint handler
        cfg = constraint_config or ConstraintConfig(vehicle_capacity=self.vehicle_capacity)
        cfg.vehicle_capacity = self.vehicle_capacity
        self.constraint_handler = ConstraintHandler(cfg)

    def setup_deliveries(self, num_deliveries: int = 10, custom_nodes: Optional[List[int]] = None):
        """
        Assign delivery demands to network nodes.
        """
        all_nodes = list(self.graph_engine.nodes_data.keys())
        if self.depot_node in all_nodes:
            all_nodes.remove(self.depot_node)

        if not all_nodes:
            self.delivery_nodes = []
            self.demands = {}
            return

        if custom_nodes:
            self.delivery_nodes = [n for n in custom_nodes if n in self.graph_engine.nodes_data and n != self.depot_node]
        else:
            sample_size = min(max(1, num_deliveries), len(all_nodes))
            self.delivery_nodes = random.sample(all_nodes, sample_size)

        # Assign realistic parcel delivery weights (5 to 30 kg per stop)
        self.demands = {
            node: round(random.uniform(8.0, 28.0), 1)
            for node in self.delivery_nodes
        }

    def decode_particle(self, position: np.ndarray) -> List[List[int]]:
        """
        Decode continuous particle position in [0, 1]^D to discrete vehicle routes.
        Supports multi-vehicle assignment and intra-route ordering.
        When num_vehicles > 1, each continuous variable maps to:
          - Target vehicle index: floor(pos_i * num_vehicles)
          - Priority rank within vehicle: fractional part (pos_i * num_vehicles - veh_idx)
        Capacity constraints and balanced fleet routing are enforced.
        """
        if not self.delivery_nodes:
            return [[] for _ in range(self.num_vehicles)]

        num_deliv = len(self.delivery_nodes)
        if len(position) != num_deliv:
            return [[] for _ in range(self.num_vehicles)]

        V = self.num_vehicles
        routes: List[List[int]] = [[] for _ in range(V)]

        if V == 1:
            # Single vehicle: sort all delivery nodes by particle coordinate value
            sorted_indices = np.argsort(position)
            ordered_nodes = [self.delivery_nodes[i] for i in sorted_indices]
            routes[0] = ordered_nodes
            return routes

        # Multi-vehicle: partition stops across vehicles using continuous variable values
        veh_buckets: List[List[Tuple[int, float, float]]] = [[] for _ in range(V)]

        for i, node in enumerate(self.delivery_nodes):
            val = float(np.clip(position[i], 0.0, 0.999999))
            v_idx = min(int(val * V), V - 1)
            rank = (val * V) - v_idx
            demand = float(self.demands.get(node, 10.0))
            veh_buckets[v_idx].append((node, rank, demand))

        # Sort intra-vehicle stops by rank
        for v_idx in range(V):
            veh_buckets[v_idx].sort(key=lambda x: x[1])
            routes[v_idx] = [item[0] for item in veh_buckets[v_idx]]

        # Capacity-aware rebalancing if a vehicle exceeds maximum payload
        vehicle_loads = [sum(self.demands.get(n, 10.0) for n in routes[v]) for v in range(V)]
        for v_idx in range(V):
            while vehicle_loads[v_idx] > self.vehicle_capacity and len(routes[v_idx]) > 1:
                # Find another vehicle with lowest load that has capacity
                overflow_node = routes[v_idx].pop()
                node_demand = self.demands.get(overflow_node, 10.0)
                vehicle_loads[v_idx] -= node_demand

                # Find best alternative vehicle
                target_v = int(np.argmin(vehicle_loads))
                routes[target_v].append(overflow_node)
                vehicle_loads[target_v] += node_demand

        return routes

    def encode_routes(self, routes: List[List[int]]) -> np.ndarray:
        """
        Encode discrete routes into continuous position vector [0, 1]^D.
        """
        if not self.delivery_nodes:
            return np.array([])

        dim = len(self.delivery_nodes)
        position = np.zeros(dim)
        V = self.num_vehicles

        if V == 1:
            flat_order = routes[0] if routes else []
            for rank, node in enumerate(flat_order):
                if node in self.delivery_nodes:
                    idx = self.delivery_nodes.index(node)
                    position[idx] = (rank + 0.5) / max(1, len(flat_order))
            return position

        for v_idx, r in enumerate(routes):
            for rank, node in enumerate(r):
                if node in self.delivery_nodes:
                    idx = self.delivery_nodes.index(node)
                    frac = (rank + 0.5) / max(1, len(r))
                    position[idx] = (v_idx + frac) / V

        return position

    def check_constraints(self, routes: List[List[int]]) -> Tuple[bool, str]:
        """Check all constraints and return (is_feasible, reason)."""
        full_routes = self.get_route_nodes(routes)
        report = self.constraint_handler.evaluate_constraints(
            full_routes, self.demands, self.graph_engine
        )
        return report.is_feasible, report.summary_reason

    def compute_penalty(self, routes: List[List[int]]) -> float:
        """Compute numerical constraint penalty."""
        full_routes = self.get_route_nodes(routes)
        return self.constraint_handler.compute_penalty(
            full_routes, self.demands, self.graph_engine
        )

    def get_route_nodes(self, routes: List[List[int]]) -> List[List[int]]:
        """
        Expands vehicle route deliveries to include depot start and depot end:
        e.g., [1, 5, 8] -> [Depot, 1, 5, 8, Depot]
        If a vehicle has no assigned deliveries, returns [Depot, Depot].
        """
        full_routes = []
        for r in routes:
            if not r:
                full_routes.append([self.depot_node, self.depot_node])
            else:
                full_routes.append([self.depot_node] + list(r) + [self.depot_node])
        return full_routes
