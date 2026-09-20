import networkx as nx
import numpy as np
import random
import math
from typing import Dict, List, Tuple, Optional, Any


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance in kilometers between two points
    on the earth (specified in decimal degrees).
    """
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return max(0.1, R * c)


class GraphEngine:
    """
    Transportation Graph Engine powered by NetworkX and OpenStreetMap-compatible attributes.
    Nodes represent intersections / delivery hubs.
    Edges represent road segments with:
      - distance (km, computed via Haversine)
      - base_time (minutes, based on speed limit)
      - congestion (0.0 to 1.0, traffic intensity)
      - travel_time (minutes, dynamic via BPR congestion model)
      - op_cost (INR, fleet operating cost = fuel + driver time + vehicle wear)
      - road_type (motorway, primary, secondary, residential)
      - speed_limit (km/h)
      - lanes (1-4)
    """

    CITY_CENTERS = {
        'delhi': (28.6139, 77.2090),
        'mumbai': (19.0760, 72.8777),
        'bengaluru': (12.9716, 77.5946),
        'chennai': (13.0827, 80.2707),
        'kolkata': (22.5726, 88.3639),
        'hyderabad': (17.3850, 78.4867),
        'custom': (20.5937, 78.9629)
    }

    ROAD_TYPES = [
        {'type': 'motorway', 'speed': 80.0, 'lanes': 4, 'weight': 0.15},
        {'type': 'primary', 'speed': 50.0, 'lanes': 3, 'weight': 0.35},
        {'type': 'secondary', 'speed': 40.0, 'lanes': 2, 'weight': 0.30},
        {'type': 'residential', 'speed': 25.0, 'lanes': 1, 'weight': 0.20}
    ]

    def __init__(self):
        self.graph: Optional[nx.DiGraph] = None
        self.nodes_data: Dict[int, Dict[str, Any]] = {}
        self.edges_data: Dict[Tuple[int, int], Dict[str, Any]] = {}
        self.current_city: str = 'delhi'

    def build_simulated_city(self, city: str = 'delhi', num_nodes: int = 50) -> nx.DiGraph:
        """
        Build an OpenStreetMap-compatible road network graph.
        Places nodes geographically around city center coordinates with jitter,
        connects nodes via nearest-neighbor Delaunay/k-NN road topology,
        and assigns realistic road attributes.
        """
        self.current_city = city.lower()
        self.graph = nx.DiGraph()
        self.nodes_data.clear()
        self.edges_data.clear()

        center_lat, center_lng = self.CITY_CENTERS.get(self.current_city, self.CITY_CENTERS['delhi'])

        # Generate realistic spatial distribution around center
        grid_size = math.ceil(math.sqrt(num_nodes))
        lat_step = 0.04
        lng_step = 0.04

        node_id = 0
        for i in range(grid_size):
            for j in range(grid_size):
                if node_id >= num_nodes:
                    break

                jitter_lat = random.uniform(-0.012, 0.012)
                jitter_lng = random.uniform(-0.012, 0.012)

                lat = center_lat + (i - grid_size / 2.0) * lat_step + jitter_lat
                lng = center_lng + (j - grid_size / 2.0) * lng_step + jitter_lng

                node_info = {
                    'lat': float(lat),
                    'lng': float(lng),
                    'name': f"{city.title()}_Hub_{node_id}",
                    'osm_id': 1000000 + node_id
                }
                self.nodes_data[node_id] = node_info
                self.graph.add_node(node_id, **node_info)
                node_id += 1

        # Connect road edges based on geographic proximity
        for i in range(num_nodes):
            distances = []
            for j in range(num_nodes):
                if i != j:
                    d_km = haversine_distance(
                        self.nodes_data[i]['lat'], self.nodes_data[i]['lng'],
                        self.nodes_data[j]['lat'], self.nodes_data[j]['lng']
                    )
                    distances.append((d_km, j))

            distances.sort(key=lambda x: x[0])
            # Connect to 3 to 5 nearest geographic neighbors
            num_connections = min(len(distances), random.randint(3, 5))
            for k in range(num_connections):
                dist_km, target = distances[k]

                if not self.graph.has_edge(i, target):
                    # Pick road hierarchy
                    road = random.choices(
                        self.ROAD_TYPES,
                        weights=[r['weight'] for r in self.ROAD_TYPES]
                    )[0]

                    speed_kmh = road['speed'] + random.uniform(-5.0, 5.0)
                    base_time_min = (dist_km / max(10.0, speed_kmh)) * 60.0
                    initial_congestion = random.uniform(0.1, 0.5)

                    # BPR-inspired travel time: TravelTime = BaseTime * (1 + 0.5 * Congestion^2)
                    travel_time_min = base_time_min * (1.0 + 1.2 * (initial_congestion ** 1.5))
                    # Operational cost: Fuel (approx Rs 8.5/km) + Wear (Rs 3.5/km) + Time (Rs 2/min)
                    op_cost_inr = dist_km * 12.0 + travel_time_min * 2.0

                    edge_attrs = {
                        'distance': round(dist_km, 3),
                        'speed_limit': round(speed_kmh, 1),
                        'road_type': road['type'],
                        'lanes': road['lanes'],
                        'base_time': round(base_time_min, 2),
                        'congestion': round(initial_congestion, 3),
                        'travel_time': round(travel_time_min, 2),
                        'op_cost': round(op_cost_inr, 2)
                    }

                    self.edges_data[(i, target)] = edge_attrs
                    self.graph.add_edge(i, target, **edge_attrs)

                    # 85% bidirectional roads (standard urban grid)
                    if random.random() < 0.85 and not self.graph.has_edge(target, i):
                        self.edges_data[(target, i)] = edge_attrs.copy()
                        self.graph.add_edge(target, i, **edge_attrs)

        # Guarantee strong connectivity across entire network
        if not nx.is_strongly_connected(self.graph):
            components = list(nx.strongly_connected_components(self.graph))
            for c_idx in range(len(components) - 1):
                u = random.choice(list(components[c_idx]))
                v = random.choice(list(components[c_idx + 1]))

                dist_km = haversine_distance(
                    self.nodes_data[u]['lat'], self.nodes_data[u]['lng'],
                    self.nodes_data[v]['lat'], self.nodes_data[v]['lng']
                )
                speed_kmh = 45.0
                base_time = (dist_km / speed_kmh) * 60.0
                congestion = 0.25
                travel_time = base_time * (1.0 + 1.2 * (congestion ** 1.5))
                op_cost = dist_km * 12.0 + travel_time * 2.0

                edge_attrs = {
                    'distance': round(dist_km, 3),
                    'speed_limit': speed_kmh,
                    'road_type': 'primary',
                    'lanes': 2,
                    'base_time': round(base_time, 2),
                    'congestion': congestion,
                    'travel_time': round(travel_time, 2),
                    'op_cost': round(op_cost, 2)
                }

                self.edges_data[(u, v)] = edge_attrs
                self.graph.add_edge(u, v, **edge_attrs)
                self.edges_data[(v, u)] = edge_attrs.copy()
                self.graph.add_edge(v, u, **edge_attrs)

        return self.graph

    def update_congestion(self, congestion_map: Dict[Tuple[int, int], float]):
        """
        Dynamically update congestion values and recompute travel times and costs.
        """
        for edge, new_cong in congestion_map.items():
            if edge in self.edges_data:
                clamped_cong = max(0.0, min(1.0, float(new_cong)))
                self.edges_data[edge]['congestion'] = round(clamped_cong, 3)
                base_t = self.edges_data[edge]['base_time']
                dist = self.edges_data[edge]['distance']

                # Dynamic BPR travel time update
                travel_time = base_t * (1.0 + 1.5 * (clamped_cong ** 1.8))
                op_cost = dist * 12.0 + travel_time * 2.0

                self.edges_data[edge]['travel_time'] = round(travel_time, 2)
                self.edges_data[edge]['op_cost'] = round(op_cost, 2)

                # Sync with NetworkX graph
                u, v = edge
                if self.graph.has_edge(u, v):
                    self.graph[u][v]['congestion'] = round(clamped_cong, 3)
                    self.graph[u][v]['travel_time'] = round(travel_time, 2)
                    self.graph[u][v]['op_cost'] = round(op_cost, 2)

    def get_graph_data(self) -> Dict[str, Any]:
        """Return serializable graph representation for frontend visualization."""
        nodes = []
        for n, d in self.nodes_data.items():
            nodes.append({
                'id': n,
                'lat': d['lat'],
                'lng': d['lng'],
                'name': d.get('name', f"Node {n}"),
                'osm_id': d.get('osm_id', n)
            })

        edges = []
        for (u, v), d in self.edges_data.items():
            edges.append({
                'source': u,
                'target': v,
                'distance': d['distance'],
                'speed_limit': d.get('speed_limit', 40.0),
                'road_type': d.get('road_type', 'primary'),
                'lanes': d.get('lanes', 2),
                'base_time': d['base_time'],
                'congestion': d['congestion'],
                'travel_time': d['travel_time'],
                'op_cost': d['op_cost']
            })

        return {
            'city': self.current_city,
            'num_nodes': len(nodes),
            'num_edges': len(edges),
            'nodes': nodes,
            'edges': edges
        }

    def get_distance_matrix(self) -> np.ndarray:
        """Return NxN pairwise distance matrix."""
        num_nodes = len(self.nodes_data)
        dist_matrix = np.full((num_nodes, num_nodes), np.inf)

        for (u, v), d in self.edges_data.items():
            dist_matrix[u][v] = d['distance']

        for i in range(num_nodes):
            dist_matrix[i][i] = 0.0

        return dist_matrix

    def shortest_path(self, source: int, target: int, weight: str = 'travel_time') -> List[int]:
        """Compute shortest path between two nodes using NetworkX Dijkstra."""
        try:
            return nx.shortest_path(self.graph, source=source, target=target, weight=weight)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    def shortest_path_length(self, source: int, target: int, weight: str = 'travel_time') -> float:
        """Compute shortest path length."""
        try:
            return nx.shortest_path_length(self.graph, source=source, target=target, weight=weight)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return float('inf')
