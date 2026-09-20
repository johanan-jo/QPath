# QPath: Quantum-Inspired Intelligent Traffic Route Optimization

### SIH 2026 — Problem Statement 26137

**QPath** is a full-stack platform for optimizing vehicle routes across large-scale transportation networks using **Quantum Particle Swarm Optimization (QPSO)** on classical computing hardware.

---

## 🌟 Key Features

1. **Multi-Objective Optimization Function**:
   $$F(R) = w_1 T(R) + w_2 D(R) + w_3 C(R) + w_4 O(R)$$
   - $T(R)$: Total Travel Time (minutes)
   - $D(R)$: Total Travel Distance (km)
   - $C(R)$: Congestion Cost / Intensity
   - $O(R)$: Operational Cost (Fuel & fleet wear in ₹)
   - Configurable objective weights ($w_1, w_2, w_3, w_4$) with dynamic normalization.

2. **Quantum Particle Swarm Optimization (QPSO)**:
   - Quantum wave function / tunneling position update: $x = p \pm \beta |m_{best} - x| \ln(1/u)$
   - Attractor point $p = \phi p_{best} + (1-\phi) g_{best}$
   - Mean best position $m_{best}$ computation across swarm
   - Adaptive contraction-expansion coefficient ($\beta$) annealing
   - Constraint handling for multi-vehicle capacity & delivery requirements

3. **Multi-Algorithm Comparison Baseline**:
   - **QPSO** (Quantum-Inspired PSO)
   - **Classical PSO** (Velocity-inertia standard model)
   - **Genetic Algorithm (GA)** (Tournament selection, order crossover, mutation)
   - **Dijkstra** (Greedy multi-vehicle nearest neighbor shortest path)
   - **OR-Tools CVRP** (Exact / constraint integer programming solver)

4. **Interactive Dashboard & Leaflet Map**:
   - Simulated Indian city graphs (Delhi, Mumbai, Bengaluru, Custom)
   - Color-coded edge congestion (Green = Low, Amber = Moderate, Red = High)
   - Multi-vehicle route overlays with distinct vehicle colors
   - Live traffic simulation & incident injection via WebSocket
   - Real-time Convergence Graphs (Fitness vs. Iterations) & Comparative Benchmark Matrix

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend
python -m pip install -r requirements.txt
python main.py
```
*Backend runs on `http://localhost:8000` with Swagger docs at `http://localhost:8000/docs`.*

### 2. Frontend Setup

```bash
cd frontend
npm install
npm start
```
*Frontend opens at `http://localhost:3000`.*

---

## 📊 Evaluation & Benchmarking

Open the web dashboard at `http://localhost:3000`:
1. Select city network and node count (e.g. Delhi, 50 nodes).
2. Adjust vehicle count, capacity, and delivery demands.
3. Configure multi-objective weights ($w_1, w_2, w_3, w_4$).
4. Click **"Optimize Routes"** for instant QPSO optimization.
5. Click **"Compare All"** to evaluate QPSO vs. PSO, GA, Dijkstra, and OR-Tools side-by-side with convergence charts and performance tables.
