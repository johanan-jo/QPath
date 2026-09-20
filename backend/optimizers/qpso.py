import numpy as np
import random
from typing import List, Dict, Tuple, Optional, Any
from optimizers.base import BaseOptimizer
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator


class QPSOOptimizer(BaseOptimizer):
    """
    Quantum-Behaved Particle Swarm Optimization (QPSO) for Vehicle Route Optimization.
    
    Theoretical Formulation:
    In QPSO, particles are depicted in quantum state space where velocity vectors are discarded.
    Instead, each particle moves in a Delta potential well centered at an attractor point p_i.
    
    1. Local Attractor:
       p_{i, d} = phi * pbest_{i, d} + (1 - phi) * gbest_d,   phi ~ U(0, 1)
       
    2. Mean Best Position (mbest):
       mbest_d = (1 / N) * sum_{i=1}^N pbest_{i, d}
       
    3. Characteristic Length & Quantum Wavefunction Update:
       L_{i, d} = |mbest_d - x_{i, d}|
       x_{i, d}(t+1) = p_{i, d} +/- beta * L_{i, d} * ln(1 / u),   u ~ U(0, 1)
       
    4. Adaptive Contraction-Expansion Coefficient (beta):
       beta(t) = beta_start - (beta_start - beta_end) * (t / max_iterations)
    """

    def __init__(
        self,
        num_particles: int = 30,
        max_iterations: int = 100,
        beta_start: float = 1.0,
        beta_end: float = 0.5,
        convergence_threshold: float = 1e-5,
        convergence_window: int = 12
    ):
        super().__init__(name="QPSO")
        self.num_particles = max(5, num_particles)
        self.max_iterations = max(10, max_iterations)
        self.beta_start = beta_start
        self.beta_end = beta_end
        self.convergence_threshold = convergence_threshold
        self.convergence_window = convergence_window

    def optimize(
        self,
        vrp: VRPFormulation,
        fitness_evaluator: FitnessEvaluator,
        dim: Optional[int] = None
    ) -> Dict[str, Any]:
        """Execute QPSO optimization on the VRP formulation."""
        self.metrics.start_timer()

        if dim is None:
            dim = len(vrp.delivery_nodes)

        # Handle empty deliveries edge-case
        if dim == 0:
            self.metrics.stop_timer()
            empty_routes = [[] for _ in range(vrp.num_vehicles)]
            full_routes = vrp.get_route_nodes(empty_routes)
            return self._format_result(
                best_routes=full_routes,
                best_fitness=0.0,
                fitness_evaluator=fitness_evaluator,
                vrp=vrp,
                convergence_data=[]
            )

        # 1. Initialize particle positions uniformly in [0, 1]^D
        positions = np.random.uniform(0.0, 1.0, (self.num_particles, dim))
        if vrp.num_vehicles > 1 and dim > 1:
            for p_i in range(min(max(4, self.num_particles // 4), self.num_particles)):
                for d_i in range(dim):
                    v_target = (d_i + p_i) % vrp.num_vehicles
                    positions[p_i, d_i] = (v_target + np.random.uniform(0.1, 0.9)) / vrp.num_vehicles

        pbest = np.copy(positions)
        pbest_fitness = np.full(self.num_particles, np.inf)

        # 2. Initial evaluation of personal bests
        for i in range(self.num_particles):
            routes = vrp.decode_particle(positions[i])
            full_routes = vrp.get_route_nodes(routes)
            penalty = vrp.compute_penalty(routes)
            fit = fitness_evaluator.evaluate(full_routes, penalty)
            pbest_fitness[i] = fit

        gbest_idx = int(np.argmin(pbest_fitness))
        gbest = np.copy(pbest[gbest_idx])
        best_fitness = float(pbest_fitness[gbest_idx])

        convergence_history = []
        best_overall_position = np.copy(gbest)

        # 3. Optimization iterative loop
        for t in range(self.max_iterations):
            # Calculate Swarm Mean Best (mbest)
            mbest = np.mean(pbest, axis=0)

            # Anneal contraction-expansion parameter beta
            beta = self.beta_start - (self.beta_start - self.beta_end) * (t / self.max_iterations)

            for i in range(self.num_particles):
                # Quantum attractor point
                phi = np.random.uniform(0.0, 1.0, dim)
                p = phi * pbest[i] + (1.0 - phi) * gbest

                # Quantum tunneling position update
                u = np.random.uniform(1e-10, 1.0, dim)
                L = np.abs(mbest - positions[i])
                signs = np.where(np.random.uniform(0.0, 1.0, dim) < 0.5, 1.0, -1.0)
                
                new_pos = p + signs * beta * L * np.log(1.0 / u)
                # Bound particles within search hypercube [0, 1]
                positions[i] = np.clip(new_pos, 0.0, 1.0)

                # Decode & evaluate candidate solution
                routes = vrp.decode_particle(positions[i])
                full_routes = vrp.get_route_nodes(routes)
                penalty = vrp.compute_penalty(routes)
                fit = fitness_evaluator.evaluate(full_routes, penalty)

                # Update Personal Best (pbest)
                if fit < pbest_fitness[i]:
                    pbest_fitness[i] = fit
                    pbest[i] = np.copy(positions[i])

                    # Update Global Best (gbest)
                    if fit < best_fitness:
                        best_fitness = fit
                        gbest = np.copy(positions[i])
                        best_overall_position = np.copy(positions[i])

            self.metrics.record_iteration(t, float(best_fitness))
            convergence_history.append(float(best_fitness))

            # 4. Check early convergence
            if len(convergence_history) >= self.convergence_window:
                recent = convergence_history[-self.convergence_window:]
                if (max(recent) - min(recent)) < self.convergence_threshold:
                    break

        self.metrics.stop_timer()

        # Final decode of optimal routes
        optimal_routes = vrp.decode_particle(best_overall_position)
        full_optimal_routes = vrp.get_route_nodes(optimal_routes)

        return self._format_result(
            best_routes=full_optimal_routes,
            best_fitness=best_fitness,
            fitness_evaluator=fitness_evaluator,
            vrp=vrp,
            convergence_data=self.metrics.get_convergence_data()
        )
