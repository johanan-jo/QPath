import pytest
import numpy as np
from core.graph_engine import GraphEngine
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator


def test_vrp_formulation_decoding():
    engine = GraphEngine()
    engine.build_simulated_city(city='delhi', num_nodes=25)

    vrp = VRPFormulation(engine, num_vehicles=3, vehicle_capacity=80.0, depot_node=0)
    vrp.setup_deliveries(num_deliveries=8)

    assert len(vrp.delivery_nodes) == 8
    assert len(vrp.demands) == 8

    # Random continuous position
    pos = np.random.uniform(0, 1, 8)
    routes = vrp.decode_particle(pos)

    assert len(routes) == 3
    # All delivery nodes must be visited
    visited_nodes = [node for r in routes for node in r]
    assert set(visited_nodes) == set(vrp.delivery_nodes)

    full_routes = vrp.get_route_nodes(routes)
    for r in full_routes:
        assert r[0] == 0  # Starts at depot
        assert r[-1] == 0  # Ends at depot


def test_multi_objective_fitness_evaluation():
    engine = GraphEngine()
    engine.build_simulated_city(city='delhi', num_nodes=20)

    evaluator = FitnessEvaluator(
        engine,
        weights={'travel_time': 0.4, 'distance': 0.3, 'congestion': 0.2, 'op_cost': 0.1}
    )

    sample_routes = [[0, 1, 2, 0], [0, 3, 4, 0]]
    fitness = evaluator.evaluate(sample_routes)
    assert fitness > 0

    metrics = evaluator.get_detailed_metrics(sample_routes)
    assert 'travel_time' in metrics
    assert 'distance' in metrics
    assert 'congestion_sum' in metrics
    assert 'op_cost' in metrics
    assert metrics['travel_time'] > 0
    assert metrics['distance'] > 0
