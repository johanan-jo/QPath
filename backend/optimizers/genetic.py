import numpy as np
import random
from typing import List, Dict, Tuple, Optional, Any
from optimizers.base import BaseOptimizer
from core.vrp_formulation import VRPFormulation
from utils.fitness import FitnessEvaluator


class GeneticOptimizer(BaseOptimizer):
    """
    Genetic Algorithm (GA) baseline for VRP.
    Features:
      - Tournament selection
      - Continuous uniform crossover
      - Gaussian perturbation mutation
      - Elitism preservation
    """

    def __init__(
        self,
        population_size: int = 40,
        max_generations: int = 100,
        crossover_rate: float = 0.85,
        mutation_rate: float = 0.08,
        tournament_size: int = 4,
        elitism_count: int = 2,
        convergence_threshold: float = 1e-5,
        convergence_window: int = 12
    ):
        super().__init__(name="Genetic")
        self.population_size = max(10, population_size)
        self.max_generations = max(10, max_generations)
        self.crossover_rate = crossover_rate
        self.mutation_rate = mutation_rate
        self.tournament_size = tournament_size
        self.elitism_count = elitism_count
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

        # 1. Initialize population
        population = np.random.uniform(0.0, 1.0, (self.population_size, dim))
        if vrp.num_vehicles > 1 and dim > 1:
            for p_i in range(min(max(4, self.population_size // 4), self.population_size)):
                for d_i in range(dim):
                    v_target = (d_i + p_i) % vrp.num_vehicles
                    population[p_i, d_i] = (v_target + np.random.uniform(0.1, 0.9)) / vrp.num_vehicles

        fitnesses = np.zeros(self.population_size)

        for i in range(self.population_size):
            routes = vrp.decode_particle(population[i])
            full_routes = vrp.get_route_nodes(routes)
            penalty = vrp.compute_penalty(routes)
            fitnesses[i] = fitness_evaluator.evaluate(full_routes, penalty)

        best_idx = int(np.argmin(fitnesses))
        best_fitness = float(fitnesses[best_idx])
        best_chromosome = np.copy(population[best_idx])

        convergence_history = []

        # 2. Evolutionary cycle
        for gen in range(self.max_generations):
            # Sort current population for elitism
            sorted_indices = np.argsort(fitnesses)
            new_population = [np.copy(population[idx]) for idx in sorted_indices[:self.elitism_count]]

            while len(new_population) < self.population_size:
                # Tournament Selection
                p1 = self._tournament_select(population, fitnesses)
                p2 = self._tournament_select(population, fitnesses)

                # Crossover
                if random.random() < self.crossover_rate:
                    c1, c2 = self._crossover(p1, p2, dim)
                else:
                    c1, c2 = np.copy(p1), np.copy(p2)

                # Mutation
                c1 = self._mutate(c1, dim)
                c2 = self._mutate(c2, dim)

                new_population.append(c1)
                if len(new_population) < self.population_size:
                    new_population.append(c2)

            population = np.array(new_population)

            # Evaluate new population
            for i in range(self.population_size):
                routes = vrp.decode_particle(population[i])
                full_routes = vrp.get_route_nodes(routes)
                penalty = vrp.compute_penalty(routes)
                fitnesses[i] = fitness_evaluator.evaluate(full_routes, penalty)

            current_best_idx = int(np.argmin(fitnesses))
            if fitnesses[current_best_idx] < best_fitness:
                best_fitness = float(fitnesses[current_best_idx])
                best_chromosome = np.copy(population[current_best_idx])

            self.metrics.record_iteration(gen, float(best_fitness))
            convergence_history.append(float(best_fitness))

            if len(convergence_history) >= self.convergence_window:
                recent = convergence_history[-self.convergence_window:]
                if (max(recent) - min(recent)) < self.convergence_threshold:
                    break

        self.metrics.stop_timer()

        optimal_routes = vrp.decode_particle(best_chromosome)
        full_optimal_routes = vrp.get_route_nodes(optimal_routes)

        return self._format_result(
            best_routes=full_optimal_routes,
            best_fitness=best_fitness,
            fitness_evaluator=fitness_evaluator,
            vrp=vrp,
            convergence_data=self.metrics.get_convergence_data()
        )

    def _tournament_select(self, population: np.ndarray, fitnesses: np.ndarray) -> np.ndarray:
        candidate_indices = np.random.choice(len(population), min(self.tournament_size, len(population)), replace=False)
        best_candidate = candidate_indices[np.argmin(fitnesses[candidate_indices])]
        return population[best_candidate]

    def _crossover(self, parent1: np.ndarray, parent2: np.ndarray, dim: int) -> Tuple[np.ndarray, np.ndarray]:
        mask = np.random.choice([True, False], dim)
        child1 = np.where(mask, parent1, parent2)
        child2 = np.where(mask, parent2, parent1)
        return child1, child2

    def _mutate(self, individual: np.ndarray, dim: int) -> np.ndarray:
        if random.random() < self.mutation_rate:
            perturb_mask = np.random.rand(dim) < 0.25
            noise = np.random.normal(0.0, 0.15, dim)
            individual[perturb_mask] += noise[perturb_mask]
            individual = np.clip(individual, 0.0, 1.0)
        return individual
