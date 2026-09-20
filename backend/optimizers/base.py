from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator
from utils.metrics import PerformanceMetrics


class BaseOptimizer(ABC):
    """
    Abstract Base Class for all route optimization algorithms in QPath.
    Provides a unified interface and consistent output structure.
    """

    def __init__(self, name: str = "BaseOptimizer"):
        self.name = name
        self.metrics = PerformanceMetrics()

    @abstractmethod
    def optimize(
        self,
        vrp: VRPFormulation,
        fitness_evaluator: FitnessEvaluator,
        dim: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Execute the optimization algorithm for the given VRP formulation.

        Args:
            vrp: VRP problem formulation containing graph, vehicle count, capacity, demands.
            fitness_evaluator: Evaluator for computing multi-objective fitness.
            dim: Dimension of the problem (typically number of delivery nodes).

        Returns:
            Dict containing:
                - best_routes: List[List[int]] - list of node paths per vehicle
                - best_fitness: float - minimum fitness achieved
                - metrics: Dict - compute time, iterations, convergence data
                - detailed_metrics: Dict - travel_time, distance, congestion, op_cost
                - convergence_data: List[Dict] - iteration history
                - algorithm: str - name of the algorithm
                - is_feasible: bool - whether all constraints are satisfied
                - total_travel_time: float
                - total_distance: float
                - total_congestion: float
                - total_op_cost: float
                - compute_time: float
                - fitness: float
                - convergence: List[float]
        """
        pass

    def _format_result(
        self,
        best_routes: list,
        best_fitness: float,
        fitness_evaluator: FitnessEvaluator,
        vrp: VRPFormulation,
        convergence_data: list,
        extra_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Standardizes the output dictionary across all optimizers.
        """
        detailed = fitness_evaluator.get_detailed_metrics(best_routes)
        is_feasible, reason = vrp.check_constraints(best_routes)
        
        result = {
            'algorithm': self.name,
            'best_routes': best_routes,
            'best_fitness': float(best_fitness),
            'is_feasible': is_feasible,
            'feasibility_reason': reason,
            'metrics': self.metrics.get_summary(),
            'detailed_metrics': detailed,
            'convergence_data': convergence_data,
            # Top-level direct keys for easy consumer access
            'total_travel_time': detailed.get('travel_time', 0.0),
            'total_distance': detailed.get('distance', 0.0),
            'total_congestion': detailed.get('congestion_sum', 0.0),
            'total_op_cost': detailed.get('op_cost', 0.0),
            'compute_time': self.metrics.get_compute_time(),
            'fitness': float(best_fitness),
            'convergence': [c['fitness'] for c in convergence_data if isinstance(c, dict) and 'fitness' in c]
        }
        
        if extra_info:
            result.update(extra_info)
            
        return result
