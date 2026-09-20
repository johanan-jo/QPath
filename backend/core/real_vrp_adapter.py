from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import networkx as nx
import numpy as np

from core.graph_engine import GraphEngine
from core.vrp_formulation import VRPFormulation
from core.constraints import ConstraintConfig
from utils.fitness import FitnessEvaluator
from core.real_routing_engine import RealRoutingEngine
from optimizers.qpso import QPSOOptimizer
from optimizers.pso import PSOOptimizer
from optimizers.genetic import GeneticOptimizer
from optimizers.dijkstra import DijkstraOptimizer
from optimizers.ortools_solver import ORToolsSolver


class RealVRPAdapter:
    """
    Adapts real-world GPS coordinates (User Depot + Delivery Points D1..Dn)
    into the QPath graph and multi-objective optimization suite.
    Enables QPSO, PSO, GA, Dijkstra, and OR-Tools to solve real-world routing.
    """

    def __init__(self, routing_engine: Optional[RealRoutingEngine] = None):
        self.routing_engine = routing_engine or RealRoutingEngine()

    def create_real_world_environment(
        self,
        depot: Dict[str, Any],
        delivery_points: List[Dict[str, Any]],
        num_vehicles: int = 1,
        vehicle_capacity: float = 100.0,
        weights: Optional[Dict[str, float]] = None,
        congestion_modifiers: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Constructs:
        - Synthetic GraphEngine instance backed by real road matrices
        - VRPFormulation with parcel demands
        - Multi-objective FitnessEvaluator
        """
        all_points = [depot] + delivery_points
        num_points = len(all_points)

        # 1. Fetch real road distance, travel time, congestion, and cost matrices
        dist_mat, time_mat, cong_mat, cost_mat = self.routing_engine.fetch_distance_and_duration_matrix(
            all_points, congestion_modifiers=congestion_modifiers
        )

        # 2. Build underlying GraphEngine
        graph_engine = GraphEngine()
        graph_engine.graph = nx.DiGraph()

        for idx, pt in enumerate(all_points):
            is_depot = (idx == 0)
            node_info = {
                'lat': float(pt['lat']),
                'lng': float(pt['lng']),
                'name': pt.get('name', 'Depot' if is_depot else f"D{idx}"),
                'demand': float(pt.get('demand', 0.0 if is_depot else 10.0)),
                'is_depot': is_depot,
                'point_id': pt.get('id', f"node_{idx}"),
                'delivery_label': 'Depot' if is_depot else f"D{idx}"
            }
            graph_engine.nodes_data[idx] = node_info
            graph_engine.graph.add_node(idx, **node_info)

        # Add all pairwise directed edges
        for i in range(num_points):
            for j in range(num_points):
                if i != j:
                    edge_attrs = {
                        'distance': float(dist_mat[i][j]),
                        'travel_time': float(time_mat[i][j]),
                        'base_time': float(time_mat[i][j]),
                        'congestion': float(cong_mat[i][j]),
                        'op_cost': float(cost_mat[i][j]),
                        'speed_limit': 40.0,
                        'road_type': 'primary',
                        'lanes': 2
                    }
                    graph_engine.edges_data[(i, j)] = edge_attrs
                    graph_engine.graph.add_edge(i, j, **edge_attrs)

        # 3. Create VRP Formulation
        constraint_cfg = ConstraintConfig(vehicle_capacity=vehicle_capacity)
        vrp = VRPFormulation(
            graph_engine,
            num_vehicles=max(1, num_vehicles),
            vehicle_capacity=vehicle_capacity,
            depot_node=0,
            constraint_config=constraint_cfg
        )
        vrp.delivery_nodes = list(range(1, num_points))
        vrp.demands = {idx: float(all_points[idx].get('demand', 10.0)) for idx in range(1, num_points)}

        # 4. Create Fitness Evaluator
        evaluator = FitnessEvaluator(graph_engine, weights=weights)

        return {
            'graph_engine': graph_engine,
            'vrp': vrp,
            'evaluator': evaluator,
            'all_points': all_points,
            'dist_mat': dist_mat,
            'time_mat': time_mat,
            'cong_mat': cong_mat
        }

    def solve_and_generate_road_routes(
        self,
        env: Dict[str, Any],
        algorithm: str = "qpso",
        num_particles: int = 30,
        max_iterations: int = 100
    ) -> Dict[str, Any]:
        """
        Executes the optimization algorithm and stitches together
        the high-resolution real-world road polylines for the vehicle routes.
        """
        vrp = env['vrp']
        evaluator = env['evaluator']
        graph_engine = env['graph_engine']
        all_points = env['all_points']
        algo_key = algorithm.lower()

        # Instantiate optimizer
        if algo_key == 'qpso':
            optimizer = QPSOOptimizer(num_particles=num_particles, max_iterations=max_iterations)
        elif algo_key == 'pso':
            optimizer = PSOOptimizer(num_particles=num_particles, max_iterations=max_iterations)
        elif algo_key == 'genetic':
            optimizer = GeneticOptimizer(population_size=num_particles, max_generations=max_iterations)
        elif algo_key == 'dijkstra':
            optimizer = DijkstraOptimizer()
        elif algo_key in ['ortools', 'or-tools']:
            optimizer = ORToolsSolver()
        else:
            optimizer = QPSOOptimizer(num_particles=num_particles, max_iterations=max_iterations)

        # Run optimization
        result = optimizer.optimize(vrp, evaluator)

        # Current clock for realistic ETAs
        base_clock = datetime.now()

        # Convert node sequences to high-resolution road polylines with per-leg metadata
        vehicle_routes = []
        full_road_polylines = []
        assigned_markers_info = {}

        for v_idx, raw_nodes in enumerate(result['best_routes']):
            legs = []
            v_polyline = []
            accumulated_time = 0.0
            accumulated_dist = 0.0
            v_stops = []

            # Check if this vehicle has any delivery stops assigned
            has_stops = any(n != 0 for n in raw_nodes)
            if not has_stops:
                vehicle_routes.append({
                    'vehicle_id': v_idx + 1,
                    'vehicle_name': f"Vehicle {v_idx + 1}",
                    'assigned_stops': [],
                    'stop_sequence': ['Depot (Standby)'],
                    'node_ids': [0],
                    'legs': [],
                    'total_distance_km': 0.0,
                    'total_time_min': 0.0,
                    'total_op_cost_inr': 0.0,
                    'average_congestion_pct': 0,
                    'status': 'Standby (Available)',
                    'polyline': []
                })
                full_road_polylines.append([])
                continue

            # Apply 2-opt tour refinement to guarantee optimal, uncrossed route sequence
            route_nodes = self._two_opt_route(raw_nodes, graph_engine, evaluator)

            for i in range(len(route_nodes) - 1):
                u, v = route_nodes[i], route_nodes[i + 1]
                if u == v:
                    continue

                start_pt = all_points[u]
                end_pt = all_points[v]

                # Fetch real road path
                leg_coords = self.routing_engine.fetch_road_geometry_polyline(start_pt, end_pt)
                edge_data = graph_engine.edges_data.get((u, v), {})
                leg_time = edge_data.get('travel_time', 5.0)
                leg_dist = edge_data.get('distance', 2.0)
                leg_cong = edge_data.get('congestion', 0.25)
                leg_cost = edge_data.get('op_cost', leg_dist * 12.0)

                accumulated_time += leg_time
                accumulated_dist += leg_dist

                arrival_dt = base_clock + timedelta(minutes=accumulated_time)
                formatted_arrival = arrival_dt.strftime("%I:%M %p")

                # Traffic condition label and color
                if leg_cong < 0.35:
                    traffic_label = "Low Traffic (Free Flow)"
                    traffic_color = "#10b981"  # Green
                elif leg_cong < 0.65:
                    traffic_label = "Moderate Traffic"
                    traffic_color = "#f59e0b"  # Yellow / Amber
                else:
                    traffic_label = "High Congestion / Delay"
                    traffic_color = "#ef4444"  # Red

                leg_info = {
                    'leg_index': i + 1,
                    'from_node': u,
                    'to_node': v,
                    'from_name': start_pt.get('name', f"Node {u}"),
                    'to_name': end_pt.get('name', f"Node {v}"),
                    'distance_km': round(leg_dist, 2),
                    'travel_time_min': round(leg_time, 2),
                    'congestion': round(leg_cong, 3),
                    'congestion_pct': int(round(leg_cong * 100)),
                    'traffic_condition': traffic_label,
                    'traffic_color': traffic_color,
                    'estimated_arrival_min': round(accumulated_time, 1),
                    'estimated_arrival_clock': formatted_arrival,
                    'op_cost_inr': round(leg_cost, 2),
                    'path_coords': leg_coords
                }
                legs.append(leg_info)

                # Record per-stop metadata for marker click details
                if v != 0:  # If not final depot return
                    v_label = f"D{v}"
                    assigned_markers_info[v_label] = {
                        'delivery_label': v_label,
                        'name': end_pt.get('name', f"Stop {v}"),
                        'lat': end_pt['lat'],
                        'lng': end_pt['lng'],
                        'demand': end_pt.get('demand', 10.0),
                        'assigned_vehicle': v_idx + 1,
                        'sequence_index': len(v_stops) + 1,
                        'total_stops_in_vehicle': sum(1 for n in route_nodes if n != 0),
                        'distance_from_prev_km': round(leg_dist, 2),
                        'travel_time_from_prev_min': round(leg_time, 2),
                        'congestion_pct': int(round(leg_cong * 100)),
                        'traffic_condition': traffic_label,
                        'traffic_color': traffic_color,
                        'estimated_arrival_min': round(accumulated_time, 1),
                        'estimated_arrival_clock': formatted_arrival
                    }
                    v_stops.append(v_label)

                # Append to vehicle polyline (skip duplicate adjacent vertex)
                if not v_polyline:
                    v_polyline.extend(leg_coords)
                else:
                    v_polyline.extend(leg_coords[1:])

            # Vehicle summary card info
            avg_v_cong = (sum(l['congestion'] for l in legs) / max(1, len(legs))) if legs else 0.0
            vehicle_routes.append({
                'vehicle_id': v_idx + 1,
                'vehicle_name': f"Vehicle {v_idx + 1}",
                'assigned_stops': v_stops,
                'assigned_points': [all_points[n] for n in route_nodes if n != 0],
                'stop_sequence': [all_points[n].get('name', f"Node {n}") for n in route_nodes if n != 0 or len(route_nodes) <= 2],
                'node_ids': route_nodes,
                'legs': legs,
                'total_distance_km': round(accumulated_dist, 2),
                'total_time_min': round(accumulated_time, 2),
                'total_op_cost_inr': round(sum(l['op_cost_inr'] for l in legs), 2),
                'average_congestion_pct': int(round(avg_v_cong * 100)),
                'status': 'Optimized & Scheduled',
                'polyline': v_polyline
            })
            full_road_polylines.append(v_polyline)

        result['vehicle_routes'] = vehicle_routes
        result['route_coords'] = full_road_polylines
        result['assigned_markers_info'] = assigned_markers_info
        result['depot'] = all_points[0]
        result['delivery_points'] = all_points[1:]
        return result

    def _two_opt_route(self, route_nodes: List[int], graph_engine, evaluator) -> List[int]:
        """
        Applies 2-opt local search optimization to a single vehicle's route.
        Eliminates crossed edges, minimizes total travel time and road distance.
        """
        if len(route_nodes) <= 3:
            return list(route_nodes)

        best_route = list(route_nodes)
        improved = True

        def route_cost(r):
            cost = 0.0
            for i in range(len(r) - 1):
                u, v = r[i], r[i + 1]
                if u != v:
                    cost += evaluator._get_edge_attribute(u, v, 'travel_time', default=4.0)
            return cost

        best_cost = route_cost(best_route)

        passes = 0
        while improved and passes < 40:
            improved = False
            passes += 1
            for i in range(1, len(best_route) - 2):
                for j in range(i + 1, len(best_route) - 1):
                    new_route = best_route[:i] + best_route[i:j+1][::-1] + best_route[j+1:]
                    new_cost = route_cost(new_route)
                    if new_cost < best_cost - 1e-4:
                        best_route = new_route
                        best_cost = new_cost
                        improved = True
                        break
                if improved:
                    break

        return best_route
