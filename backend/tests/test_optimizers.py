import pytest
from core.graph_engine import GraphEngine
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator
from optimizers.qpso import QPSOOptimizer
from optimizers.pso import PSOOptimizer
from optimizers.genetic import GeneticOptimizer
from optimizers.dijkstra import DijkstraOptimizer
from optimizers.ortools_solver import ORToolsSolver


@pytest.fixture
def setup_vrp_environment():
    engine = GraphEngine()
    engine.build_simulated_city(city='delhi', num_nodes=25)
    vrp = VRPFormulation(engine, num_vehicles=2, vehicle_capacity=100.0, depot_node=0)
    vrp.setup_deliveries(num_deliveries=6)
    evaluator = FitnessEvaluator(engine)
    return vrp, evaluator


def test_qpso_optimizer(setup_vrp_environment):
    vrp, evaluator = setup_vrp_environment
    opt = QPSOOptimizer(num_particles=15, max_iterations=20)
    res = opt.optimize(vrp, evaluator)

    assert res['algorithm'] == 'QPSO'
    assert res['best_fitness'] > 0
    assert len(res['best_routes']) == 2
    assert len(res['convergence_data']) > 0
    assert 'total_travel_time' in res
    assert 'total_distance' in res
    assert 'total_congestion' in res
    assert 'total_op_cost' in res


def test_pso_optimizer(setup_vrp_environment):
    vrp, evaluator = setup_vrp_environment
    opt = PSOOptimizer(num_particles=15, max_iterations=20)
    res = opt.optimize(vrp, evaluator)

    assert res['algorithm'] == 'PSO'
    assert res['best_fitness'] > 0
    assert len(res['best_routes']) == 2


def test_genetic_optimizer(setup_vrp_environment):
    vrp, evaluator = setup_vrp_environment
    opt = GeneticOptimizer(population_size=15, max_generations=20)
    res = opt.optimize(vrp, evaluator)

    assert res['algorithm'] == 'Genetic'
    assert res['best_fitness'] > 0
    assert len(res['best_routes']) == 2


def test_dijkstra_optimizer(setup_vrp_environment):
    vrp, evaluator = setup_vrp_environment
    opt = DijkstraOptimizer()
    res = opt.optimize(vrp, evaluator)

    assert res['algorithm'] == 'Dijkstra'
    assert res['best_fitness'] > 0
    assert len(res['best_routes']) == 2


def test_ortools_optimizer(setup_vrp_environment):
    vrp, evaluator = setup_vrp_environment
    opt = ORToolsSolver()
    res = opt.optimize(vrp, evaluator)

    assert 'OR-Tools' in res['algorithm']
    assert res['best_fitness'] > 0
    assert len(res['best_routes']) == 2
