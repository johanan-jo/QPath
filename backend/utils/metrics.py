import time
import numpy as np
from typing import List, Dict

class PerformanceMetrics:
    """Records and computes algorithm performance metrics."""
    
    def __init__(self):
        self.convergence_history = []  # list of (iteration, fitness) tuples
        self.start_time = None
        self.end_time = None
    
    def start_timer(self):
        self.start_time = time.time()
        self.convergence_history = []
    
    def stop_timer(self):
        self.end_time = time.time()
    
    def record_iteration(self, iteration: int, best_fitness: float):
        self.convergence_history.append({'iteration': iteration, 'fitness': best_fitness})
    
    def get_compute_time(self) -> float:
        """Return elapsed compute time in seconds."""
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        return 0.0
    
    def get_convergence_data(self) -> List[Dict]:
        return self.convergence_history
    
    def compute_scalability_score(self, num_nodes: int, compute_time: float) -> float:
        """Score from 0-100 based on time complexity vs. problem size."""
        # Lower time relative to num_nodes = higher score
        if compute_time <= 0:
            return 100.0
        ratio = num_nodes / (compute_time + 1e-6)
        return min(100.0, ratio / 10.0)
    
    def get_summary(self) -> Dict:
        return {
            'compute_time_sec': self.get_compute_time(),
            'convergence_iterations': len(self.convergence_history),
            'final_fitness': self.convergence_history[-1]['fitness'] if self.convergence_history else None,
            'convergence_data': self.get_convergence_data()
        }
