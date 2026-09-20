from typing import List, Dict, Optional, Any
import numpy as np
from optimizers.base import BaseOptimizer
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator


class ORToolsSolver(BaseOptimizer):
    """
    Google OR-Tools Capacitated Vehicle Routing Problem (CVRP) exact/metaheuristic solver.
    Provides industrial-strength comparison baseline.
    Falls back gracefully to Dijkstra if OR-Tools is unavailable.
    """

    def __init__(self, time_limit_seconds: int = 5):
        super().__init__(name="OR-Tools")
        self.time_limit_seconds = time_limit_seconds
        self._ortools_available = False
        try:
            from ortools.constraint_solver import pywrapcp, routing_enums_pb2
            self._ortools_available = True
        except ImportError:
            self._ortools_available = False

    def optimize(
        self,
        vrp: VRPFormulation,
        fitness_evaluator: FitnessEvaluator,
        dim: Optional[int] = None
    ) -> Dict[str, Any]:
        if not self._ortools_available:
            from optimizers.dijkstra import DijkstraOptimizer
            dijk = DijkstraOptimizer()
            res = dijk.optimize(vrp, fitness_evaluator, dim)
            res['algorithm'] = "OR-Tools (Fallback)"
            return res

        return self._solve_with_ortools(vrp, fitness_evaluator)

    def _solve_with_ortools(
        self,
        vrp: VRPFormulation,
        fitness_evaluator: FitnessEvaluator
    ) -> Dict[str, Any]:
        from ortools.constraint_solver import pywrapcp, routing_enums_pb2

        self.metrics.start_timer()

        if not vrp.delivery_nodes:
            self.metrics.stop_timer()
            empty_routes = vrp.get_route_nodes([[] for _ in range(vrp.num_vehicles)])
            return self._format_result(
                best_routes=empty_routes,
                best_fitness=0.0,
                fitness_evaluator=fitness_evaluator,
                vrp=vrp,
                convergence_data=[]
            )

        # Build subproblem node list: index 0 is depot, subsequent indices are delivery nodes
        all_locations = [vrp.depot_node] + list(vrp.delivery_nodes)
        num_locations = len(all_locations)

        # Distance matrix for the subproblem (in integer units for OR-Tools)
        dist_matrix = np.zeros((num_locations, num_locations), dtype=int)
        for i in range(num_locations):
            for j in range(num_locations):
                if i != j:
                    u, v = all_locations[i], all_locations[j]
                    cost = fitness_evaluator._get_edge_attribute(u, v, 'travel_time', default=5.0)
                    dist_matrix[i][j] = int(cost * 100)

        # Demands array
        demands = [0] + [int(vrp.demands.get(n, 10.0)) for n in vrp.delivery_nodes]

        # OR-Tools routing index manager and model
        manager = pywrapcp.RoutingIndexManager(num_locations, vrp.num_vehicles, 0)
        routing = pywrapcp.RoutingModel(manager)

        def distance_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return dist_matrix[from_node][to_node]

        transit_callback_index = routing.RegisterTransitCallback(distance_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

        # Add Capacity constraint
        def demand_callback(from_index):
            from_node = manager.IndexToNode(from_index)
            return demands[from_node]

        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,  # null capacity slack
            [int(vrp.vehicle_capacity)] * vrp.num_vehicles,  # vehicle maximum capacities
            True,  # start cumul to zero
            'Capacity'
        )

        # Search parameters
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.seconds = self.time_limit_seconds

        solution = routing.SolveWithParameters(search_parameters)

        self.metrics.stop_timer()

        raw_routes = []
        if solution:
            for vehicle_id in range(vrp.num_vehicles):
                index = routing.Start(vehicle_id)
                v_route = []
                while not routing.IsEnd(index):
                    node_index = manager.IndexToNode(index)
                    if node_index != 0:  # Skip depot node in raw list
                        v_route.append(all_locations[node_index])
                    index = solution.Value(routing.NextVar(index))
                raw_routes.append(v_route)
        else:
            # Fallback naive partition
            raw_routes = [[] for _ in range(vrp.num_vehicles)]
            for idx, node in enumerate(vrp.delivery_nodes):
                raw_routes[idx % vrp.num_vehicles].append(node)

        full_routes = vrp.get_route_nodes(raw_routes)
        penalty = vrp.compute_penalty(raw_routes)
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
