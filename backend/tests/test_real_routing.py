import pytest
from core.real_routing_engine import RealRoutingEngine
from core.real_vrp_adapter import RealVRPAdapter


def test_real_routing_engine():
    engine = RealRoutingEngine()
    coords = [
        {'lat': 28.6139, 'lng': 77.2090},  # Connaught Place, Delhi
        {'lat': 28.6129, 'lng': 77.2295},  # India Gate, Delhi
        {'lat': 28.5672, 'lng': 77.2100}   # AIIMS, Delhi
    ]

    dist_mat, time_mat, cong_mat, cost_mat = engine.fetch_distance_and_duration_matrix(coords)
    assert dist_mat.shape == (3, 3)
    assert time_mat.shape == (3, 3)
    assert dist_mat[0, 1] > 0
    assert time_mat[0, 1] > 0

    polyline = engine.fetch_road_geometry_polyline(coords[0], coords[1])
    assert len(polyline) >= 2
    assert 'lat' in polyline[0] and 'lng' in polyline[0]


def test_real_vrp_adapter_qpso():
    adapter = RealVRPAdapter()
    depot = {'lat': 28.6139, 'lng': 77.2090, 'name': 'Depot / GPS Location'}
    deliveries = [
        {'id': 'd1', 'name': 'D1 - India Gate', 'lat': 28.6129, 'lng': 77.2295, 'demand': 15.0},
        {'id': 'd2', 'name': 'D2 - AIIMS Delhi', 'lat': 28.5672, 'lng': 77.2100, 'demand': 20.0},
        {'id': 'd3', 'name': 'D3 - Karol Bagh', 'lat': 28.6517, 'lng': 77.1906, 'demand': 10.0}
    ]

    env = adapter.create_real_world_environment(
        depot=depot,
        delivery_points=deliveries,
        num_vehicles=1,
        vehicle_capacity=100.0
    )

    res = adapter.solve_and_generate_road_routes(env, algorithm="qpso", num_particles=15, max_iterations=20)
    assert res['algorithm'] == 'QPSO'
    assert res['best_fitness'] > 0
    assert len(res['vehicle_routes']) == 1
    assert len(res['vehicle_routes'][0]['legs']) >= 3
    assert len(res['vehicle_routes'][0]['polyline']) > 5
