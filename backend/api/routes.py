from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from core.graph_engine import GraphEngine
from core.traffic_simulator import TrafficSimulator
from core.vrp_formulation import VRPFormulation
from core.constraints import ConstraintConfig
from core.dispatch_manager import dispatch_manager
from api.auth import get_current_user, require_admin
from utils.fitness import FitnessEvaluator
from utils.benchmarking import BenchmarkEngine
from optimizers.qpso import QPSOOptimizer
from optimizers.pso import PSOOptimizer
from optimizers.genetic import GeneticOptimizer
from optimizers.dijkstra import DijkstraOptimizer
from optimizers.ortools_solver import ORToolsSolver

router = APIRouter(prefix="/api", tags=["qpath"])

# Singleton core engine instances
graph_engine = GraphEngine()
traffic_simulator = TrafficSimulator(graph_engine)
benchmark_engine = BenchmarkEngine(graph_engine)


# ---------------- Pydantic Request & Response Models ----------------

class GraphGenerateRequest(BaseModel):
    city: str = Field(default="delhi", description="City road network (delhi, mumbai, bengaluru, chennai, kolkata, hyderabad)")
    num_nodes: int = Field(default=50, ge=10, le=200, description="Number of intersections/hubs in graph")


class OptimizeRequest(BaseModel):
    source_node: int = Field(default=0, ge=0, description="Depot node index")
    destination_node: Optional[int] = Field(default=None, description="Optional target destination node")
    num_vehicles: int = Field(default=3, ge=1, le=20, description="Number of fleet vehicles")
    vehicle_capacity: float = Field(default=100.0, ge=10.0, le=1000.0, description="Payload capacity per vehicle (kg)")
    num_deliveries: int = Field(default=10, ge=1, le=50, description="Number of delivery demand stops")
    delivery_nodes: Optional[List[int]] = Field(default=None, description="Explicit delivery node indices if specified")
    algorithm: str = Field(default="qpso", description="Routing algorithm (qpso, pso, genetic, dijkstra, ortools, all)")
    weights: Dict[str, float] = Field(
        default={'travel_time': 0.35, 'distance': 0.25, 'congestion': 0.25, 'op_cost': 0.15},
        description="Multi-objective weights for F(R)"
    )
    city: str = Field(default="delhi")
    num_nodes: int = Field(default=50, ge=10, le=200)
    traffic_preset: str = Field(default="moderate", description="free_flow, moderate, heavy, incident, gridlock")
    # Metaheuristic hyperparameters
    num_particles: int = Field(default=30, ge=5, le=100)
    max_iterations: int = Field(default=100, ge=10, le=500)


class TrafficUpdateRequest(BaseModel):
    preset: Optional[str] = Field(default=None, description="free_flow, moderate, heavy, incident, gridlock")
    incident_edge: Optional[List[int]] = Field(default=None, description="[source_node, target_node] for localized blockage")
    severity: float = Field(default=0.95, ge=0.0, le=1.0)


class BenchmarkRequest(BaseModel):
    city: str = "delhi"
    num_nodes: int = 40
    num_vehicles: int = 3
    vehicle_capacity: float = 100.0
    num_deliveries: int = 10
    num_trials: int = Field(default=3, ge=1, le=10)
    algorithms: Optional[List[str]] = ["qpso", "pso", "genetic", "dijkstra", "ortools"]
    weights: Dict[str, float] = {'travel_time': 0.35, 'distance': 0.25, 'congestion': 0.25, 'op_cost': 0.15}


# ---------------- Helper Functions ----------------

def _ensure_graph_ready(city: str = "delhi", num_nodes: int = 50):
    """Ensure the underlying road network is built and ready."""
    if not graph_engine.graph or len(graph_engine.nodes_data) != num_nodes or graph_engine.current_city != city.lower():
        graph_engine.build_simulated_city(city, num_nodes)
        traffic_simulator.simulate_step()


def _attach_coordinate_paths(result: Dict[str, Any]) -> Dict[str, Any]:
    """Attach GPS lat/lng coordinates to vehicle routes for map visualization."""
    coords = []
    for route in result.get('best_routes', []):
        rc = []
        for n in route:
            d = graph_engine.nodes_data.get(n)
            if d:
                rc.append({'lat': d['lat'], 'lng': d['lng'], 'node_id': n, 'name': d.get('name', f"Node {n}")})
        coords.append(rc)
    result['route_coords'] = coords
    return result


def _execute_optimizer(algo: str, vrp: VRPFormulation, evaluator: FitnessEvaluator, req: OptimizeRequest) -> Dict[str, Any]:
    """Instantiate and run a specific optimizer."""
    algo_key = algo.lower()
    if algo_key == 'qpso':
        opt = QPSOOptimizer(num_particles=req.num_particles, max_iterations=req.max_iterations)
    elif algo_key == 'pso':
        opt = PSOOptimizer(num_particles=req.num_particles, max_iterations=req.max_iterations)
    elif algo_key == 'genetic':
        opt = GeneticOptimizer(population_size=req.num_particles, max_generations=req.max_iterations)
    elif algo_key == 'dijkstra':
        opt = DijkstraOptimizer()
    elif algo_key in ['ortools', 'or-tools']:
        opt = ORToolsSolver()
    else:
        raise ValueError(f"Unsupported algorithm '{algo}'. Choose from: qpso, pso, genetic, dijkstra, ortools.")

    res = opt.optimize(vrp, evaluator)
    return _attach_coordinate_paths(res)


# ---------------- REST API Endpoints ----------------

@router.get("/health")
def health_check():
    """Health check and service status."""
    return {
        "status": "healthy",
        "service": "QPath Quantum-Inspired Traffic Optimization API",
        "version": "1.0.0",
        "graph_loaded": graph_engine.graph is not None,
        "nodes_count": len(graph_engine.nodes_data)
    }


@router.get("/graph")
def get_graph(city: str = "delhi", num_nodes: int = 50):
    """Retrieve road network nodes and edges for map rendering."""
    _ensure_graph_ready(city, num_nodes)
    return graph_engine.get_graph_data()


@router.post("/graph/generate")
def generate_graph(req: GraphGenerateRequest):
    """Explicitly regenerate transportation graph with specific parameters."""
    graph_engine.build_simulated_city(req.city, req.num_nodes)
    traffic_simulator.clear_all_incidents()
    return {
        "message": f"Generated {req.city.title()} graph with {req.num_nodes} nodes",
        "graph_data": graph_engine.get_graph_data()
    }


@router.get("/traffic")
def get_traffic():
    """Get current dynamic traffic condition state."""
    return traffic_simulator.get_traffic_state()


@router.post("/traffic/update")
def update_traffic(req: TrafficUpdateRequest):
    """Update traffic preset or inject localized road blockage incidents."""
    if req.preset:
        traffic_simulator.set_preset(req.preset)
        traffic_simulator.simulate_step()

    if req.incident_edge and len(req.incident_edge) == 2:
        edge = (req.incident_edge[0], req.incident_edge[1])
        traffic_simulator.inject_incident(edge, req.severity)

    return traffic_simulator.get_traffic_state()


@router.post("/traffic/reset")
def reset_traffic():
    """Reset traffic conditions and clear incidents."""
    traffic_simulator.clear_all_incidents()
    traffic_simulator.set_preset("moderate")
    return traffic_simulator.get_traffic_state()


@router.post("/optimize")
def optimize_routes(req: OptimizeRequest):
    """
    Run route optimization using QPSO or comparison algorithms.
    Returns optimal routes, GPS coordinates, multi-objective metrics, and convergence curve.
    """
    _ensure_graph_ready(req.city, req.num_nodes)

    traffic_simulator.set_preset(req.traffic_preset)
    traffic_simulator.simulate_step()

    # Formulate VRP with constraints
    constraint_cfg = ConstraintConfig(vehicle_capacity=req.vehicle_capacity)
    vrp = VRPFormulation(
        graph_engine,
        num_vehicles=req.num_vehicles,
        vehicle_capacity=req.vehicle_capacity,
        depot_node=req.source_node,
        constraint_config=constraint_cfg
    )
    vrp.setup_deliveries(req.num_deliveries, custom_nodes=req.delivery_nodes)

    evaluator = FitnessEvaluator(graph_engine, weights=req.weights)

    if req.algorithm.lower() == "all":
        algos = ['qpso', 'pso', 'genetic', 'dijkstra', 'ortools']
        comparison = []
        for a in algos:
            try:
                res = _execute_optimizer(a, vrp, evaluator, req)
                comparison.append(res)
            except Exception as e:
                comparison.append({'algorithm': a.upper(), 'error': str(e), 'best_fitness': None})

        return {
            "comparison": comparison,
            "graph_data": graph_engine.get_graph_data(),
            "traffic_state": traffic_simulator.get_traffic_state()
        }
    else:
        try:
            res = _execute_optimizer(req.algorithm, vrp, evaluator, req)
            res["graph_data"] = graph_engine.get_graph_data()
            res["traffic_state"] = traffic_simulator.get_traffic_state()
            return res
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))


@router.post("/compare")
def compare_algorithms(req: OptimizeRequest):
    """Run side-by-side benchmark comparing QPSO vs PSO, GA, Dijkstra, and OR-Tools."""
    _ensure_graph_ready(req.city, req.num_nodes)

    traffic_simulator.set_preset(req.traffic_preset)
    traffic_simulator.simulate_step()

    constraint_cfg = ConstraintConfig(vehicle_capacity=req.vehicle_capacity)
    vrp = VRPFormulation(
        graph_engine,
        num_vehicles=req.num_vehicles,
        vehicle_capacity=req.vehicle_capacity,
        depot_node=req.source_node,
        constraint_config=constraint_cfg
    )
    vrp.setup_deliveries(req.num_deliveries, custom_nodes=req.delivery_nodes)

    evaluator = FitnessEvaluator(graph_engine, weights=req.weights)

    algos = ['qpso', 'pso', 'genetic', 'dijkstra', 'ortools']
    comparison = []
    for a in algos:
        try:
            res = _execute_optimizer(a, vrp, evaluator, req)
            comparison.append(res)
        except Exception as e:
            comparison.append({'algorithm': a.upper(), 'error': str(e), 'best_fitness': None})

    return {
        "comparison": comparison,
        "graph_data": graph_engine.get_graph_data(),
        "traffic_state": traffic_simulator.get_traffic_state()
    }


@router.post("/benchmark")
def run_statistical_benchmark(req: BenchmarkRequest):
    """Run multi-trial statistical benchmark for rigorous evaluation."""
    _ensure_graph_ready(req.city, req.num_nodes)

    vrp = VRPFormulation(
        graph_engine,
        num_vehicles=req.num_vehicles,
        vehicle_capacity=req.vehicle_capacity,
        depot_node=0
    )
    vrp.setup_deliveries(req.num_deliveries)

    evaluator = FitnessEvaluator(graph_engine, weights=req.weights)

    benchmark_data = benchmark_engine.run_benchmark(
        vrp=vrp,
        fitness_evaluator=evaluator,
        algorithms=req.algorithms,
        num_trials=req.num_trials
    )

    return {
        "city": req.city,
        "nodes": req.num_nodes,
        "vehicles": req.num_vehicles,
        "deliveries": req.num_deliveries,
        **benchmark_data
    }


# ---------------- Real-World Delivery Points Routing Endpoints ----------------

from core.real_vrp_adapter import RealVRPAdapter
from core.real_routing_engine import RealRoutingEngine

real_routing_engine = RealRoutingEngine()
real_vrp_adapter = RealVRPAdapter(real_routing_engine)


class DeliveryPoint(BaseModel):
    id: Optional[str] = None
    name: str = "Delivery Point"
    lat: float
    lng: float
    demand: float = 10.0  # kg


class RealDeliveryOptimizeRequest(BaseModel):
    depot: DeliveryPoint
    delivery_points: List[DeliveryPoint]
    num_vehicles: int = 1
    vehicle_capacity: float = 100.0
    algorithm: str = "qpso"
    weights: Dict[str, float] = {'travel_time': 0.35, 'distance': 0.25, 'congestion': 0.25, 'op_cost': 0.15}
    num_particles: int = 30
    max_iterations: int = 100
    congestion_modifiers: Optional[Dict[str, float]] = None


@router.post("/real-route/optimize")
def optimize_real_delivery_routes(req: RealDeliveryOptimizeRequest):
    """
    Optimizes a real delivery route starting from the user's GPS depot location
    and visiting all designated real-world delivery destinations (D1, D2..Dn).
    Computes QPSO routing sequence over real road networks and returns real-road polylines.
    """
    if not req.delivery_points:
        raise HTTPException(status_code=400, detail="Please provide at least one delivery destination.")

    env = real_vrp_adapter.create_real_world_environment(
        depot=req.depot.model_dump(),
        delivery_points=[pt.model_dump() for pt in req.delivery_points],
        num_vehicles=req.num_vehicles,
        vehicle_capacity=req.vehicle_capacity,
        weights=req.weights,
        congestion_modifiers=req.congestion_modifiers
    )

    result = real_vrp_adapter.solve_and_generate_road_routes(
        env=env,
        algorithm=req.algorithm,
        num_particles=req.num_particles,
        max_iterations=req.max_iterations
    )

    # Synchronize dispatch assignments for all fleet drivers
    try:
        dispatch_manager.update_from_optimization_result(
            result=result,
            depot=req.depot.model_dump(),
            delivery_points=[pt.model_dump() for pt in req.delivery_points]
        )
    except Exception as e:
        print(f"Warning: dispatch update error: {e}")

    return result


@router.post("/real-route/compare")
def compare_real_delivery_routes(req: RealDeliveryOptimizeRequest):
    """
    Runs QPSO vs PSO, GA, Dijkstra, and OR-Tools on real GPS road coordinates.
    """
    if not req.delivery_points:
        raise HTTPException(status_code=400, detail="Please provide at least one delivery destination.")

    env = real_vrp_adapter.create_real_world_environment(
        depot=req.depot.model_dump(),
        delivery_points=[pt.model_dump() for pt in req.delivery_points],
        num_vehicles=req.num_vehicles,
        vehicle_capacity=req.vehicle_capacity,
        weights=req.weights,
        congestion_modifiers=req.congestion_modifiers
    )

    algos = ['qpso', 'pso', 'genetic', 'dijkstra', 'ortools']
    comparison = []
    for a in algos:
        try:
            res = real_vrp_adapter.solve_and_generate_road_routes(
                env=env,
                algorithm=a,
                num_particles=req.num_particles,
                max_iterations=req.max_iterations
            )
            comparison.append(res)
        except Exception as e:
            comparison.append({'algorithm': a.upper(), 'error': str(e), 'best_fitness': None})

    return {
        "comparison": comparison,
        "depot": req.depot.model_dump(),
        "delivery_points": [pt.model_dump() for pt in req.delivery_points]
    }


# ---------------- Driver & Role-Based Dispatch Endpoints ----------------

class UpdateDeliveryStatusRequest(BaseModel):
    driver_id: str = Field(..., description="Driver identifier (e.g. driver1)")
    stop_id: str = Field(..., description="Delivery stop identifier (e.g. d1)")
    status: str = Field(..., description="Pending, In Progress, or Delivered")


class AcceptJobRequest(BaseModel):
    driver_id: str = Field(..., description="Driver ID (e.g. driver1)")
    job_id: str = Field(..., description="Job ID (e.g. JOB-DEL-101)")
    driver_gps: Optional[Dict[str, float]] = Field(default=None, description="Driver's current GPS location {lat, lng}")


class CompleteDeliveryRequest(BaseModel):
    driver_id: str = Field(..., description="Driver ID")
    job_id: str = Field(..., description="Job ID")
    stop_id: str = Field(..., description="Delivery stop ID")
    driver_gps: Optional[Dict[str, float]] = Field(default=None, description="Driver's current GPS location {lat, lng}")


class FailDeliveryRequest(BaseModel):
    driver_id: str = Field(..., description="Driver ID")
    job_id: str = Field(..., description="Job ID")
    stop_id: str = Field(..., description="Delivery stop ID")
    reason: str = Field(..., description="Reason why the package could not be delivered")
    driver_gps: Optional[Dict[str, float]] = Field(default=None, description="Driver's current GPS location {lat, lng}")



class PublishJobRequest(BaseModel):
    title: Optional[str] = None
    priority: Optional[str] = "High Priority"
    delivery_points: List[DeliveryPoint]


@router.get("/driver/available-jobs")
def get_available_jobs(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns the list of unassigned delivery jobs available for drivers to claim.
    """
    return {
        "available_jobs": dispatch_manager.get_available_jobs(),
        "total": len(dispatch_manager.get_available_jobs())
    }


@router.get("/driver/{driver_id}/view")
def get_driver_view(
    driver_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns full state for a specific driver: active accepted job (if any),
    plus available jobs if driver is currently unassigned.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != driver_id:
        raise HTTPException(
            status_code=403,
            detail=f"Access forbidden: You are logged in as {current_user.get('driver_id')} and cannot access data for {driver_id}."
        )

    try:
        return dispatch_manager.get_driver_view(driver_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/driver/accept-job")
def driver_accept_job(
    req: AcceptJobRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Driver claims an available delivery job.
    Uses driver's GPS location to compute the QPSO-optimized route.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != req.driver_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: You cannot accept jobs on behalf of another driver."
        )

    try:
        result = dispatch_manager.accept_job(
            driver_id=req.driver_id,
            job_id=req.job_id,
            driver_gps=req.driver_gps or {"lat": 28.6139, "lng": 77.2090},
            adapter=real_vrp_adapter
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/driver/complete-delivery")
def driver_complete_delivery(
    req: CompleteDeliveryRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Driver marks a delivery as Delivered.
    Updates backend state, marks stop completed, and triggers dynamic QPSO re-optimization
    for all remaining deliveries using live traffic from driver's GPS.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != req.driver_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: You cannot modify deliveries for another driver."
        )

    try:
        result = dispatch_manager.complete_delivery(
            driver_id=req.driver_id,
            job_id=req.job_id,
            stop_id=req.stop_id,
            driver_gps=req.driver_gps or {"lat": 28.6139, "lng": 77.2090},
            adapter=real_vrp_adapter
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/driver/fail-delivery")
def driver_fail_delivery(
    req: FailDeliveryRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Driver marks a delivery as Not Delivered / Failed with a specific reason.
    Updates backend state, records reason/timestamp for Admin visibility,
    re-optimizes remaining pending deliveries from driver's current GPS,
    and routes back to the hub if no more deliveries are pending.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != req.driver_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: You cannot modify deliveries for another driver."
        )

    try:
        result = dispatch_manager.fail_delivery(
            driver_id=req.driver_id,
            job_id=req.job_id,
            stop_id=req.stop_id,
            reason=req.reason,
            driver_gps=req.driver_gps or {"lat": 28.6139, "lng": 77.2090},
            adapter=real_vrp_adapter
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class CompleteReturnRequest(BaseModel):
    driver_id: str = Field(..., description="Driver ID")
    job_id: str = Field(..., description="Job ID")
    driver_gps: Optional[Dict[str, float]] = Field(default=None, description="Driver's current GPS location {lat, lng}")


class VerifyReturnRequest(BaseModel):
    job_id: str = Field(..., description="Job ID to verify/check-in returned deliverables")


@router.post("/driver/complete-return")
def driver_complete_return(
    req: CompleteReturnRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Driver confirms they have arrived back at the Central Hub with undelivered items.
    Sets job status to 'Pending Admin Verification' and notifies admin dashboard.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != req.driver_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: You cannot submit a return for another driver."
        )

    try:
        result = dispatch_manager.complete_return_to_hub(
            driver_id=req.driver_id,
            job_id=req.job_id,
            driver_gps=req.driver_gps or {"lat": 28.6139, "lng": 77.2090}
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/verify-return")
def admin_verify_return(
    req: VerifyReturnRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Admin verifies that a driver has returned to hub and checks in undelivered items.
    Releases driver back to Available status.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: Only admins can verify returned deliverables."
        )

    try:
        result = dispatch_manager.verify_return_at_hub(
            job_id=req.job_id,
            admin_id=current_user.get("username", "admin")
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class ReleaseDriverRequest(BaseModel):
    driver_id: str = Field(..., description="Driver ID to release")


@router.post("/driver/release")
def release_driver(
    req: ReleaseDriverRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Releases driver back to Available status after all deliveries are completed
    or when claiming a new job. Updates admin dashboard immediately.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != req.driver_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: You cannot release another driver."
        )

    try:
        result = dispatch_manager.release_driver(req.driver_id)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/driver/{driver_id}/assigned-route")
def get_driver_assigned_route(
    driver_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns strictly filtered route, sequence, and delivery points for the requesting driver.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != driver_id:
        raise HTTPException(
            status_code=403,
            detail=f"Access forbidden: You are logged in as {current_user.get('driver_id')} and cannot access data for {driver_id}."
        )

    route_data = dispatch_manager.get_driver_route(driver_id)
    if not route_data:
        # Check if driver has an active job in view
        d_view = dispatch_manager.get_driver_view(driver_id)
        if d_view.get("current_job") and d_view["current_job"].get("route"):
            return d_view["current_job"]["route"]
        raise HTTPException(
            status_code=404,
            detail=f"No active dispatch route found for driver {driver_id}."
        )

    return route_data


@router.post("/driver/update-status")
def update_driver_delivery_status(
    req: UpdateDeliveryStatusRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Allows a driver to update delivery stop status.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != req.driver_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: You cannot update status for another driver."
        )

    updated = dispatch_manager.update_delivery_status(
        driver_id=req.driver_id,
        stop_id=req.stop_id,
        new_status=req.status
    )
    if not updated:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid stop '{req.stop_id}' or status '{req.status}'."
        )

    return {
        "success": True,
        "driver_id": req.driver_id,
        "stop_id": req.stop_id,
        "status": req.status,
        "updated_stop": updated
    }


@router.get("/admin/fleet-live")
def get_admin_fleet_live(
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Returns comprehensive real-time fleet status, driver locations, active routes,
    and all delivery stops (pending vs delivered) for the Admin Dashboard and Map.
    """
    return dispatch_manager.get_admin_fleet_live()


@router.get("/admin/dispatch-overview")
def get_admin_dispatch_overview(
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Returns dispatch overview for admin.
    """
    return dispatch_manager.get_admin_fleet_live()


@router.post("/admin/publish-job")
def publish_admin_delivery_job(
    req: PublishJobRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Allows Admin to create and publish a new delivery job into the available pool.
    """
    job = dispatch_manager.publish_new_job({
        "title": req.title,
        "priority": req.priority,
        "delivery_points": [pt.model_dump() for pt in req.delivery_points]
    })
    return {"success": True, "job": job}


# ──────────────────────────────────────────────────────────────────────
# OTP GENERATION & CUSTOMER ENDPOINTS
# ──────────────────────────────────────────────────────────────────────

class GenerateOTPRequest(BaseModel):
    stop_id: str = Field(..., description="Delivery stop ID to generate OTP for")
    customer_name: str = Field(default="Customer", description="Customer's name")


class VerifyOTPRequest(BaseModel):
    stop_id: str = Field(..., description="Delivery stop ID")
    otp: str = Field(..., description="6-digit OTP provided by the customer")
    driver_id: str = Field(..., description="Driver ID submitting the OTP")
    driver_gps: Optional[Dict[str, float]] = Field(default=None, description="Driver GPS {lat, lng}")


class RegenerateOTPRequest(BaseModel):
    delivery_token: str = Field(..., description="Customer's unique delivery token")


@router.post("/admin/generate-otp")
def admin_generate_otp(
    req: GenerateOTPRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Admin generates an OTP for a specific delivery stop.
    Returns the plaintext OTP (shown once) and a customer access token.
    """
    try:
        result = dispatch_manager.generate_otp_for_stop(req.stop_id, req.customer_name)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/driver/verify-otp")
def driver_verify_otp(
    req: VerifyOTPRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Driver submits customer-provided OTP to verify and complete a delivery.
    Backend is the sole authority on OTP validity.
    """
    if current_user.get("role") == "driver" and current_user.get("driver_id") != req.driver_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: You cannot verify a delivery for another driver."
        )

    try:
        result = dispatch_manager.verify_otp_for_delivery(
            stop_id=req.stop_id,
            otp_entered=req.otp,
            driver_id=req.driver_id,
            driver_gps=req.driver_gps or {}
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/customer/delivery-status")
def get_customer_delivery_status(
    token: str = Query(..., description="Customer's unique delivery token")
):
    """
    PUBLIC (no auth required) — Customer tracks their own delivery.
    Uses their unique delivery token. Sees only their own stop info.
    """
    try:
        result = dispatch_manager.get_customer_delivery_status(token)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/customer/regenerate-otp")
def customer_regenerate_otp(req: RegenerateOTPRequest):
    """
    PUBLIC (no auth required) — Customer requests a new OTP after expiry.
    Rate-limited to once every 5 minutes.
    """
    try:
        result = dispatch_manager.regenerate_otp(req.delivery_token)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/admin/otp-verification-table")
def get_admin_otp_table(
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Admin-only: Returns OTP verification status table.
    Shows Active/Expired/Verified — NEVER the actual OTP codes.
    """
    rows = dispatch_manager.get_admin_otp_verification_table()
    return {"success": True, "rows": rows, "total": len(rows)}
