import numpy as np
from typing import Dict, Any, Optional
from optimizers.base import BaseOptimizer
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator


class PSOOptimizer(BaseOptimizer):
    """
    Classical Particle Swarm Optimization (PSO) baseline.
    Uses standard velocity updates with inertia weight, cognitive component, and social component:
    v_{i}(t+1) = w * v_{i}(t) + c1 * r1 * (pbest_i - x_i) + c2 * r2 * (gbest - x_i)
    x_{i}(t+1) = x_{i}(t) + v_{i}(t+1)
    """

    def __init__(
        self,
        num_particles: int = 30,
        max_iterations: int = 100,
        w: float = 0.729,      # Inertia weight
        c1: float = 1.494,     # Cognitive acceleration coefficient
        c2: float = 1.494,     # Social acceleration coefficient
        v_max: float = 0.20,
        convergence_threshold: float = 1e-5,
        convergence_window: int = 12
    ):
        super().__init__(name="PSO")
        self.num_particles = max(5, num_particles)
        self.max_iterations = max(10, max_iterations)
        self.w = w
        self.c1 = c1
        self.c2 = c2
        self.v_max = v_max
        self.convergence_threshold = convergence_threshold
        self.convergence_window = convergence_window

    def optimize(
        self,
        vrp: VRPFormulation,
        fitness_evaluator: FitnessEvaluator,
        dim: Optional[int] = None
    ) -> Dict[str, Any]:
        self.metrics.start_timer()

        if dim is None:
            dim = len(vrp.delivery_nodes)

        if dim == 0:
            self.metrics.stop_timer()
            empty_routes = [[] for _ in range(vrp.num_vehicles)]
            return self._format_result(
                best_routes=vrp.get_route_nodes(empty_routes),
                best_fitness=0.0,
                fitness_evaluator=fitness_evaluator,
                vrp=vrp,
                convergence_data=[]
            )

        positions = np.random.uniform(0.0, 1.0, (self.num_particles, dim))
        if vrp.num_vehicles > 1 and dim > 1:
            for p_i in range(min(max(4, self.num_particles // 4), self.num_particles)):
                for d_i in range(dim):
                    v_target = (d_i + p_i) % vrp.num_vehicles
                    positions[p_i, d_i] = (v_target + np.random.uniform(0.1, 0.9)) / vrp.num_vehicles

        velocities = np.random.uniform(-self.v_max, self.v_max, (self.num_particles, dim))

        pbest = np.copy(positions)
        pbest_fitness = np.full(self.num_particles, np.inf)

        for i in range(self.num_particles):
            routes = vrp.decode_particle(positions[i])
            full_routes = vrp.get_route_nodes(routes)
            penalty = vrp.compute_penalty(routes)
            pbest_fitness[i] = fitness_evaluator.evaluate(full_routes, penalty)

        gbest_idx = int(np.argmin(pbest_fitness))
        gbest = np.copy(pbest[gbest_idx])
        best_fitness = float(pbest_fitness[gbest_idx])

        convergence_history = []
        best_overall_position = np.copy(gbest)

        for t in range(self.max_iterations):
            for i in range(self.num_particles):
                r1 = np.random.uniform(0.0, 1.0, dim)
                r2 = np.random.uniform(0.0, 1.0, dim)

                # Classical velocity update
                velocities[i] = (
                    self.w * velocities[i] +
                    self.c1 * r1 * (pbest[i] - positions[i]) +
                    self.c2 * r2 * (gbest - positions[i])
                )
                velocities[i] = np.clip(velocities[i], -self.v_max, self.v_max)

                # Position update
                positions[i] = np.clip(positions[i] + velocities[i], 0.0, 1.0)

                # Evaluate
                routes = vrp.decode_particle(positions[i])
                full_routes = vrp.get_route_nodes(routes)
                penalty = vrp.compute_penalty(routes)
                fit = fitness_evaluator.evaluate(full_routes, penalty)

                if fit < pbest_fitness[i]:
                    pbest_fitness[i] = fit
                    pbest[i] = np.copy(positions[i])

                    if fit < best_fitness:
                        best_fitness = fit
                        gbest = np.copy(positions[i])
                        best_overall_position = np.copy(positions[i])

            self.metrics.record_iteration(t, float(best_fitness))
            convergence_history.append(float(best_fitness))

            if len(convergence_history) >= self.convergence_window:
                recent = convergence_history[-self.convergence_window:]
                if (max(recent) - min(recent)) < self.convergence_threshold:
                    break

        self.metrics.stop_timer()

        optimal_routes = vrp.decode_particle(best_overall_position)
        full_optimal_routes = vrp.get_route_nodes(optimal_routes)

        return self._format_result(
            best_routes=full_optimal_routes,
            best_fitness=best_fitness,
            fitness_evaluator=fitness_evaluator,
            vrp=vrp,
            convergence_data=self.metrics.get_convergence_data()
        )
