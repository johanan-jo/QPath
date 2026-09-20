import numpy as np
import time
from typing import List, Dict, Any, Optional
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator
from optimizers.qpso import QPSOOptimizer
from optimizers.pso import PSOOptimizer
from optimizers.genetic import GeneticOptimizer
from optimizers.dijkstra import DijkstraOptimizer
from optimizers.ortools_solver import ORToolsSolver


class BenchmarkEngine:
    """
    Automated Benchmarking Engine for QPath.
    Compares QPSO against Classical PSO, Genetic Algorithm, Dijkstra, and OR-Tools
    across multiple simulation trials to produce statistically rigorous metrics.
    """

    AVAILABLE_ALGORITHMS = {
        'qpso': QPSOOptimizer,
        'pso': PSOOptimizer,
        'genetic': GeneticOptimizer,
        'dijkstra': DijkstraOptimizer,
        'ortools': ORToolsSolver
    }

    def __init__(self, graph_engine):
        self.graph_engine = graph_engine

    def run_benchmark(
        self,
        vrp: VRPFormulation,
        fitness_evaluator: FitnessEvaluator,
        algorithms: Optional[List[str]] = None,
        num_trials: int = 3,
        qpso_particles: int = 30,
        qpso_iterations: int = 100
    ) -> Dict[str, Any]:
        """
        Run statistical benchmark across selected algorithms.
        """
        if not algorithms:
            algorithms = ['qpso', 'pso', 'genetic', 'dijkstra', 'ortools']

        benchmark_results = {}
        detailed_trials = {algo: [] for algo in algorithms}

        for algo_name in algorithms:
            algo_key = algo_name.lower()
            if algo_key not in self.AVAILABLE_ALGORITHMS:
                continue

            trials_fitness = []
            trials_time = []
            trials_distance = []
            trials_travel_time = []
            trials_congestion = []
            trials_op_cost = []
            trials_feasible = []
            last_result = None

            # Instantaneous algorithms (Dijkstra, OR-Tools) only need 1 trial
            effective_trials = 1 if algo_key in ['dijkstra', 'ortools'] else num_trials

            for trial_idx in range(effective_trials):
                # Instantiate optimizer with appropriate params
                if algo_key in ['qpso', 'pso']:
                    optimizer = self.AVAILABLE_ALGORITHMS[algo_key](
                        num_particles=qpso_particles,
                        max_iterations=qpso_iterations
                    )
                elif algo_key == 'genetic':
                    optimizer = self.AVAILABLE_ALGORITHMS[algo_key](
                        population_size=qpso_particles,
                        max_generations=qpso_iterations
                    )
                else:
                    optimizer = self.AVAILABLE_ALGORITHMS[algo_key]()

                res = optimizer.optimize(vrp, fitness_evaluator)
                last_result = res

                trials_fitness.append(res['best_fitness'])
                trials_time.append(res['compute_time'])
                trials_distance.append(res['total_distance'])
                trials_travel_time.append(res['total_travel_time'])
                trials_congestion.append(res['total_congestion'])
                trials_op_cost.append(res['total_op_cost'])
                trials_feasible.append(res.get('is_feasible', True))

                detailed_trials[algo_name].append({
                    'trial': trial_idx + 1,
                    'fitness': res['best_fitness'],
                    'compute_time': res['compute_time']
                })

            benchmark_results[algo_name] = {
                'algorithm': algo_name.upper(),
                'trials_count': effective_trials,
                'mean_fitness': round(float(np.mean(trials_fitness)), 4),
                'std_fitness': round(float(np.std(trials_fitness)), 4),
                'best_fitness': round(float(np.min(trials_fitness)), 4),
                'mean_compute_time_sec': round(float(np.mean(trials_time)), 4),
                'mean_distance_km': round(float(np.mean(trials_distance)), 2),
                'mean_travel_time_min': round(float(np.mean(trials_travel_time)), 2),
                'mean_congestion_index': round(float(np.mean(trials_congestion)), 3),
                'mean_op_cost_inr': round(float(np.mean(trials_op_cost)), 2),
                'feasibility_rate': round(float(np.mean(trials_feasible)) * 100.0, 1),
                'sample_result': last_result
            }

        # Calculate relative percentage improvement of QPSO over classical baselines
        qpso_res = benchmark_results.get('qpso')
        improvements = {}
        if qpso_res:
            for name, data in benchmark_results.items():
                if name != 'qpso' and data['mean_fitness'] > 0:
                    gain = ((data['mean_fitness'] - qpso_res['mean_fitness']) / data['mean_fitness']) * 100.0
                    improvements[f"qpso_vs_{name}"] = {
                        'fitness_improvement_pct': round(gain, 2),
                        'time_saving_pct': round(((data['mean_travel_time_min'] - qpso_res['mean_travel_time_min']) / max(0.1, data['mean_travel_time_min'])) * 100.0, 2),
                        'cost_saving_pct': round(((data['mean_op_cost_inr'] - qpso_res['mean_op_cost_inr']) / max(1.0, data['mean_op_cost_inr'])) * 100.0, 2)
                    }

        return {
            'summary': list(benchmark_results.values()),
            'improvements': improvements,
            'detailed_trials': detailed_trials
        }
