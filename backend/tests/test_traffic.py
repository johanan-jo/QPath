import pytest
from core.graph_engine import GraphEngine
from core.traffic_simulator import TrafficSimulator


def test_traffic_simulation_and_presets():
    engine = GraphEngine()
    engine.build_simulated_city(city='delhi', num_nodes=20)
    sim = TrafficSimulator(engine)

    # Test free flow
    sim.set_preset("free_flow")
    state_ff = sim.simulate_step()
    avg_ff = state_ff['average_congestion']

    # Test heavy
    sim.set_preset("heavy")
    state_heavy = sim.simulate_step()
    avg_heavy = state_heavy['average_congestion']

    assert avg_heavy > avg_ff


def test_incident_injection():
    engine = GraphEngine()
    engine.build_simulated_city(city='delhi', num_nodes=20)
    sim = TrafficSimulator(engine)

    edge = list(engine.edges_data.keys())[0]
    sim.inject_incident(edge, severity=0.95)

    state = sim.get_traffic_state()
    assert state['incident_count'] >= 1
    assert engine.edges_data[edge]['congestion'] >= 0.90

    # Clear incident
    sim.clear_incident(edge)
    state_cleared = sim.get_traffic_state()
    assert state_cleared['incident_count'] == 0
