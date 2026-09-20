import pytest
from core.graph_engine import GraphEngine, haversine_distance


def test_haversine_distance():
    # Delhi to Mumbai distance approx 1150-1200 km
    delhi = (28.6139, 77.2090)
    mumbai = (19.0760, 72.8777)
    d = haversine_distance(delhi[0], delhi[1], mumbai[0], mumbai[1])
    assert 1100 <= d <= 1250


def test_graph_engine_build():
    engine = GraphEngine()
    g = engine.build_simulated_city(city='delhi', num_nodes=30)
    
    assert g is not None
    assert len(engine.nodes_data) == 30
    assert len(engine.edges_data) > 30

    # Verify edge attributes
    sample_edge = next(iter(engine.edges_data.values()))
    assert 'distance' in sample_edge
    assert 'travel_time' in sample_edge
    assert 'congestion' in sample_edge
    assert 'op_cost' in sample_edge
    assert 'speed_limit' in sample_edge
    assert sample_edge['distance'] > 0
    assert sample_edge['travel_time'] > 0


def test_graph_data_serializable():
    engine = GraphEngine()
    engine.build_simulated_city(city='mumbai', num_nodes=20)
    data = engine.get_graph_data()

    assert data['city'] == 'mumbai'
    assert data['num_nodes'] == 20
    assert len(data['nodes']) == 20
    assert len(data['edges']) > 0


def test_distance_matrix():
    engine = GraphEngine()
    engine.build_simulated_city(city='bengaluru', num_nodes=15)
    mat = engine.get_distance_matrix()

    assert mat.shape == (15, 15)
    assert mat[0, 0] == 0.0
