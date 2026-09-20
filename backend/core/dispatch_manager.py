import time
import hashlib
import secrets
import random
from typing import Dict, List, Any, Optional
from urllib.parse import quote

class DispatchManager:
    """
    Core Dispatch & Delivery Job Management Engine.
    Handles the complete Admin-to-Driver lifecycle:
    - Available Delivery Jobs pool
    - Driver job selection & acceptance
    - Driver GPS-first QPSO route calculation
    - Dynamic re-routing upon stop completion
    - Real-time fleet synchronization for Admin monitoring
    """

    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.drivers: Dict[str, Dict[str, Any]] = {}
        self.depot: Dict[str, Any] = {
            "name": "Connaught Place Central Depot, New Delhi",
            "lat": 28.6139,
            "lng": 77.2090
        }
        self.last_optimized_at: Optional[float] = None
        # OTP store: stop_id -> {otp_hash, expiry, attempts, verified, customer_token, generated_at}
        self.otp_store: Dict[str, Dict[str, Any]] = {}
        # Customer token store: delivery_token -> stop_id
        self.customer_tokens: Dict[str, str] = {}
        self._initialize_drivers()
        self._initialize_available_jobs()

    def _initialize_drivers(self):
        """Pre-configure driver roster."""
        self.drivers = {
            "driver1": {
                "driver_id": "driver1",
                "driver_name": "Rajesh Kumar",
                "assigned_vehicle": "Vehicle 1",
                "vehicle_capacity": 100.0,
                "status": "Available",  # Available, Job Accepted, En Route, Delivering, Completed
                "current_job_id": None,
                "current_location": {"lat": 28.6139, "lng": 77.2090, "name": "Connaught Place (Depot)"},
                "active_route": None,
                "route_color": "#10b981",  # Emerald
            },
            "driver2": {
                "driver_id": "driver2",
                "driver_name": "Amit Sharma",
                "assigned_vehicle": "Vehicle 2",
                "vehicle_capacity": 100.0,
                "status": "Available",
                "current_job_id": None,
                "current_location": {"lat": 28.5355, "lng": 77.2410, "name": "Greater Kailash Hub"},
                "active_route": None,
                "route_color": "#06b6d4",  # Cyan
            }
        }

    def _initialize_available_jobs(self):
        """No dummy delivery jobs by default. Jobs are created dynamically when Admin optimizes or publishes routes."""
        self.jobs = {}

    def seed_demo_jobs(self):
        """Seed demo delivery jobs for testing or evaluation if explicitly requested."""
        self.jobs = {
            "JOB-DEL-101": {
                "job_id": "JOB-DEL-101",
                "title": "Central Delhi Commercial & Medical Delivery",
                "priority": "High Priority",
                "status": "Available",  # Available, Accepted, In Progress, Completed
                "assigned_driver_id": None,
                "assigned_driver_name": None,
                "assigned_vehicle": None,
                "num_deliveries": 4,
                "total_distance_km": 28.4,
                "estimated_time_min": 58.0,
                "traffic_condition": "Moderate Traffic",
                "traffic_color": "#f59e0b",
                "created_at": time.strftime("%H:%M:%S"),
                "accepted_at": None,
                "completed_at": None,
                "depot": self.depot,
                "delivery_points": [
                    {"id": "d101-1", "label": "D1", "name": "India Gate, New Delhi", "lat": 28.6129, "lng": 77.2295, "demand": 15.0, "status": "Pending"},
                    {"id": "d101-2", "label": "D2", "name": "AIIMS Hospital, Ansari Nagar", "lat": 28.5672, "lng": 77.2100, "demand": 22.0, "status": "Pending"},
                    {"id": "d101-3", "label": "D3", "name": "Karol Bagh Market", "lat": 28.6517, "lng": 77.1906, "demand": 14.0, "status": "Pending"},
                    {"id": "d101-4", "label": "D4", "name": "Lajpat Nagar Central Market", "lat": 28.5700, "lng": 77.2400, "demand": 18.0, "status": "Pending"},
                ],
                "route": None
            },
            "JOB-DEL-102": {
                "job_id": "JOB-DEL-102",
                "title": "South Delhi Express Parcel Batch",
                "priority": "Express",
                "status": "Available",
                "assigned_driver_id": None,
                "assigned_driver_name": None,
                "assigned_vehicle": None,
                "num_deliveries": 3,
                "total_distance_km": 19.8,
                "estimated_time_min": 42.0,
                "traffic_condition": "Low Traffic (Free Flow)",
                "traffic_color": "#10b981",
                "created_at": time.strftime("%H:%M:%S"),
                "accepted_at": None,
                "completed_at": None,
                "depot": self.depot,
                "delivery_points": [
                    {"id": "d102-1", "label": "D1", "name": "Hauz Khas Village", "lat": 28.5494, "lng": 77.2001, "demand": 16.0, "status": "Pending"},
                    {"id": "d102-2", "label": "D2", "name": "Nehru Place Tech Hub", "lat": 28.5492, "lng": 77.2529, "demand": 20.0, "status": "Pending"},
                    {"id": "d102-3", "label": "D3", "name": "Saket District Centre", "lat": 28.5244, "lng": 77.2177, "demand": 12.0, "status": "Pending"},
                ],
                "route": None
            },
            "JOB-DEL-103": {
                "job_id": "JOB-DEL-103",
                "title": "North Delhi Retail Distribution",
                "priority": "Standard",
                "status": "Available",
                "assigned_driver_id": None,
                "assigned_driver_name": None,
                "assigned_vehicle": None,
                "num_deliveries": 3,
                "total_distance_km": 24.5,
                "estimated_time_min": 52.0,
                "traffic_condition": "Heavy Traffic Delays",
                "traffic_color": "#ef4444",
                "created_at": time.strftime("%H:%M:%S"),
                "accepted_at": None,
                "completed_at": None,
                "depot": self.depot,
                "delivery_points": [
                    {"id": "d103-1", "label": "D1", "name": "Chandni Chowk Market", "lat": 28.6506, "lng": 77.2303, "demand": 25.0, "status": "Pending"},
                    {"id": "d103-2", "label": "D2", "name": "Delhi University North Campus", "lat": 28.6896, "lng": 77.2095, "demand": 10.0, "status": "Pending"},
                    {"id": "d103-3", "label": "D3", "name": "Model Town Hub", "lat": 28.7032, "lng": 77.1932, "demand": 15.0, "status": "Pending"},
                ],
                "route": None
            }
        }
        # Auto-generate OTPs and customer tokens for demo jobs
        for job in self.jobs.values():
            for pt in job.get("delivery_points", []):
                self.generate_otp_for_stop(pt["id"], pt.get("name", "Customer"))

    def clear_all_jobs(self):
        """Clears all jobs and resets driver assignments."""
        self.jobs = {}
        for d in self.drivers.values():
            d["current_job_id"] = None
            d["active_route"] = None
            d["status"] = "Available"

    def get_available_jobs(self) -> List[Dict[str, Any]]:
        """Returns list of jobs currently in 'Available' state."""
        return [job for job in self.jobs.values() if job.get("status") == "Available"]

    def get_job_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self.jobs.get(job_id)

    def accept_job(self, driver_id: str, job_id: str, driver_gps: Dict[str, float], adapter=None) -> Dict[str, Any]:
        """
        Assigns the job to the driver, marks it Accepted,
        and uses driver's GPS location to compute the QPSO-optimized route.
        """
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found.")
        if job.get("status") != "Available":
            raise ValueError(f"Job {job_id} is already {job.get('status')} by {job.get('assigned_driver_id')}.")

        driver = self.drivers.get(driver_id)
        if not driver:
            raise ValueError(f"Driver {driver_id} not found.")

        # Update driver GPS location
        if driver_gps and "lat" in driver_gps and "lng" in driver_gps:
            driver["current_location"] = {
                "lat": float(driver_gps["lat"]),
                "lng": float(driver_gps["lng"]),
                "name": "Driver GPS Live"
            }

        # Atomically assign job to driver
        job["status"] = "Accepted"
        job["assigned_driver_id"] = driver_id
        job["assigned_driver_name"] = driver["driver_name"]
        job["assigned_vehicle"] = driver["assigned_vehicle"]
        job["accepted_at"] = time.strftime("%H:%M:%S")

        driver["status"] = "Job Accepted"
        driver["current_job_id"] = job_id

        # Run QPSO optimization starting from the Hub/depot to all stops in this job
        hub = job.get("depot") or self.depot
        calculated_route = self._calculate_qpso_driver_route(
            origin=hub,
            delivery_points=job["delivery_points"],
            adapter=adapter,
            return_to_hub=False
        )

        # If QPSO failed and returned the heuristic fallback, but we already have a richer
        # pre-calculated route stored in the job, prefer the pre-calculated one
        pre_route = job.get("route")
        if pre_route and not calculated_route.get("polyline"):
            calculated_route = pre_route

        job["route"] = calculated_route
        driver["active_route"] = calculated_route
        driver["status"] = "En Route"

        return {
            "job": job,
            "driver": driver,
            "route": calculated_route
        }


    def complete_delivery(
        self,
        driver_id: str,
        job_id: str,
        stop_id: str,
        driver_gps: Dict[str, float],
        adapter=None
    ) -> Dict[str, Any]:
        """
        Marks a delivery stop as Delivered.
        Removes it from the driver's remaining-delivery route.
        Recalculates the optimal route for remaining deliveries from driver's GPS.
        """
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found.")

        driver = self.drivers.get(driver_id)
        if not driver:
            raise ValueError(f"Driver {driver_id} not found.")

        # Update driver GPS location
        if driver_gps and "lat" in driver_gps and "lng" in driver_gps:
            driver["current_location"] = {
                "lat": float(driver_gps["lat"]),
                "lng": float(driver_gps["lng"]),
                "name": "Driver GPS Live"
            }

        # Find and mark stop as Delivered
        stop_found = None
        for pt in job.get("delivery_points", []):
            if pt.get("id") == stop_id or pt.get("label") == stop_id:
                pt["status"] = "Delivered"
                pt["delivered_at"] = time.strftime("%H:%M:%S")
                stop_found = pt
                break

        if not stop_found:
            raise ValueError(f"Delivery stop {stop_id} not found in job {job_id}.")

        # Check remaining pending stops
        remaining_stops = [
            pt for pt in job.get("delivery_points", [])
            if pt.get("status") in ["Pending", "In Progress"]
        ]
        failed_stops = [pt for pt in job.get("delivery_points", []) if pt.get("status") == "Failed"]

        if len(remaining_stops) > 0:
            # Re-optimize remaining route using current traffic from current GPS position, returning to hub if failures exist
            recalculated_route = self._calculate_qpso_driver_route(
                origin=driver["current_location"],
                delivery_points=remaining_stops,
                adapter=adapter,
                return_to_hub=len(failed_stops) > 0
            )
            job["route"] = recalculated_route
            driver["active_route"] = recalculated_route
            driver["status"] = "Delivering"
        else:
            hub = job.get("depot") or self.depot
            all_pts = job.get("delivery_points", [])
            n_delivered = sum(1 for p in all_pts if p.get("status") == "Delivered")
            n_failed = len(failed_stops)

            if n_failed > 0:
                # All remaining deliveries completed, but some packages could not be delivered!
                # Final stop MUST be back to the hub to return undelivered goods.
                hub_lat, hub_lng = hub["lat"], hub["lng"]
                cur_lat = driver["current_location"]["lat"]
                cur_lng = driver["current_location"]["lng"]
                hub_dist = ((hub_lat - cur_lat)**2 + (hub_lng - cur_lng)**2)**0.5 * 111.0
                hub_time = (hub_dist / 28.0) * 60.0

                hub_return_url = (
                    f"https://www.google.com/maps/dir/?api=1"
                    f"&origin={quote(f'{cur_lat},{cur_lng}')}"
                    f"&destination={quote(f'{hub_lat},{hub_lng}')}"
                    f"&travelmode=driving"
                )

                recalculated_route = {
                    "sequence_str": "All Stops Finished → Return to Hub (Return Undelivered Items)",
                    "sequence": ["Return to Hub 🏢 (Undelivered Deliverables)"],
                    "stops": all_pts,
                    "remaining_stops": [],
                    "returning_to_hub": True,
                    "polyline": [
                        [cur_lat, cur_lng],
                        [hub_lat, hub_lng]
                    ],
                    "legs": [{
                        "from_name": "Last Delivery Point",
                        "to_name": hub.get("name", "Central Hub (Depot)"),
                        "distance_km": round(hub_dist, 2),
                        "time_min": round(hub_time, 1),
                        "traffic_condition": "Return to Hub",
                        "traffic_color": "#8b5cf6"
                    }],
                    "total_distance_km": round(hub_dist, 2),
                    "total_time_min": round(hub_time, 1),
                    "traffic_condition": "Returning to Hub",
                    "traffic_color": "#8b5cf6",
                    "google_maps_url": hub_return_url,
                    "stats": {
                        "total_stops": len(all_pts),
                        "delivered": n_delivered,
                        "failed": n_failed,
                        "remaining": 0,
                        "completion_pct": round((n_delivered / len(all_pts)) * 100, 1) if all_pts else 100.0,
                        "next_stop": {"name": hub.get("name", "Central Hub (Depot)"), "lat": hub_lat, "lng": hub_lng, "label": "HUB"}
                    }
                }
                job["status"] = "Returning to Hub"
                job["completed_at"] = time.strftime("%H:%M:%S")
                driver["status"] = "Returning to Hub"
                job["route"] = recalculated_route
                driver["active_route"] = recalculated_route
            else:
                # All deliveries completed successfully!
                job["status"] = "Completed"
                job["completed_at"] = time.strftime("%H:%M:%S")
                driver["status"] = "Completed"
                recalculated_route = {
                    "sequence_str": "All Deliveries Completed",
                    "sequence": ["All Deliveries Completed ✓"],
                    "stops": all_pts,
                    "remaining_stops": [],
                    "returning_to_hub": False,
                    "polyline": [],
                    "legs": [],
                    "total_distance_km": 0.0,
                    "total_time_min": 0.0,
                    "traffic_condition": "Route Complete",
                    "traffic_color": "#10b981",
                    "google_maps_url": "",
                    "stats": {
                        "total_stops": len(all_pts),
                        "delivered": n_delivered,
                        "failed": 0,
                        "remaining": 0,
                        "completion_pct": 100.0,
                        "next_stop": None
                    }
                }
                job["route"] = recalculated_route
                driver["active_route"] = recalculated_route

        return {
            "delivered_stop": stop_found,
            "remaining_count": len(remaining_stops),
            "job_status": job["status"],
            "driver_status": driver["status"],
            "route": job["route"]
        }

    def fail_delivery(
        self,
        driver_id: str,
        job_id: str,
        stop_id: str,
        reason: str,
        driver_gps: Dict[str, float],
        adapter=None
    ) -> Dict[str, Any]:
        """
        Marks a delivery stop as Failed with a reason.
        Re-optimizes remaining pending stops from driver's current GPS.
        If no pending stops remain, adds a Return-to-Hub final leg.
        """
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found.")

        driver = self.drivers.get(driver_id)
        if not driver:
            raise ValueError(f"Driver {driver_id} not found.")

        # Update driver GPS
        if driver_gps and "lat" in driver_gps and "lng" in driver_gps:
            driver["current_location"] = {
                "lat": float(driver_gps["lat"]),
                "lng": float(driver_gps["lng"]),
                "name": "Driver GPS Live"
            }

        # Find and mark stop as Failed
        stop_found = None
        for pt in job.get("delivery_points", []):
            if pt.get("id") == stop_id or pt.get("label") == stop_id:
                pt["status"] = "Failed"
                pt["failed_reason"] = reason or "Not delivered"
                pt["failed_at"] = time.strftime("%H:%M:%S")
                pt["failed_by"] = driver.get("driver_name", driver_id)
                stop_found = pt
                break

        if not stop_found:
            raise ValueError(f"Delivery stop {stop_id} not found in job {job_id}.")

        # Remaining pending stops (excludes Delivered AND Failed)
        remaining_stops = [
            pt for pt in job.get("delivery_points", [])
            if pt.get("status") in ["Pending", "In Progress"]
        ]

        failed_stops = [pt for pt in job.get("delivery_points", []) if pt.get("status") == "Failed"]

        if len(remaining_stops) > 0:
            # Re-optimize remaining deliveries from current GPS
            recalculated_route = self._calculate_qpso_driver_route(
                origin=driver["current_location"],
                delivery_points=remaining_stops,
                adapter=adapter
            )
            job["route"] = recalculated_route
            driver["active_route"] = recalculated_route
            driver["status"] = "Delivering"
        else:
            # All stops are either Delivered or Failed — return to hub
            hub = self.depot
            hub_lat, hub_lng = hub["lat"], hub["lng"]
            cur_lat = driver["current_location"]["lat"]
            cur_lng = driver["current_location"]["lng"]
            hub_dist = ((hub_lat - cur_lat)**2 + (hub_lng - cur_lng)**2)**0.5 * 111.0
            hub_time = (hub_dist / 28.0) * 60.0

            hub_return_url = (
                f"https://www.google.com/maps/dir/?api=1"
                f"&origin={quote(f'{cur_lat},{cur_lng}')}"
                f"&destination={quote(f'{hub_lat},{hub_lng}')}"
                f"&travelmode=driving"
            )

            all_pts = job.get("delivery_points", [])
            n_delivered = sum(1 for p in all_pts if p.get("status") == "Delivered")
            n_failed = len(failed_stops)

            recalculated_route = {
                "sequence_str": "Return to Hub",
                "sequence": ["Return to Hub 🏢"],
                "stops": all_pts,
                "remaining_stops": [],
                "returning_to_hub": True,
                "polyline": [
                    [cur_lat, cur_lng],
                    [hub_lat, hub_lng]
                ],
                "legs": [{
                    "from_name": "Current Location",
                    "to_name": hub.get("name", "Hub/Depot"),
                    "distance_km": round(hub_dist, 2),
                    "time_min": round(hub_time, 1),
                    "traffic_condition": "Return to Hub",
                    "traffic_color": "#8b5cf6"
                }],
                "total_distance_km": round(hub_dist, 2),
                "total_time_min": round(hub_time, 1),
                "traffic_condition": "Returning to Hub",
                "traffic_color": "#8b5cf6",
                "google_maps_url": hub_return_url,
                "stats": {
                    "total_stops": len(all_pts),
                    "delivered": n_delivered,
                    "failed": n_failed,
                    "remaining": 0,
                    "completion_pct": round((n_delivered / len(all_pts)) * 100, 1) if all_pts else 100.0,
                    "next_stop": None
                }
            }
            job["status"] = "Completed with Failures" if n_failed > 0 else "Completed"
            job["completed_at"] = time.strftime("%H:%M:%S")
            job["route"] = recalculated_route
            driver["active_route"] = recalculated_route
            driver["status"] = "Returning to Hub"

        return {
            "failed_stop": stop_found,
            "failed_reason": reason,
            "remaining_count": len(remaining_stops),
            "failed_count": len(failed_stops),
            "job_status": job["status"],
            "driver_status": driver["status"],
            "route": job["route"]
        }

    def complete_return_to_hub(
        self,
        driver_id: str,
        job_id: str,
        driver_gps: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Called when driver has arrived back at the Central Hub with undelivered packages.
        Sets status to 'Pending Admin Verification' so the warehouse admin can inspect and sign off.
        """
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found.")

        driver = self.drivers.get(driver_id)
        if not driver:
            raise ValueError(f"Driver {driver_id} not found.")

        if driver_gps and "lat" in driver_gps and "lng" in driver_gps:
            driver["current_location"] = {
                "lat": float(driver_gps["lat"]),
                "lng": float(driver_gps["lng"]),
                "name": "Central Hub (Depot)"
            }

        timestamp = time.strftime("%H:%M:%S")
        job["status"] = "Pending Admin Verification"
        job["returned_to_hub_at"] = timestamp
        driver["status"] = "Arrived at Hub - Pending Verification"

        if job.get("route") and "stats" in job["route"]:
            job["route"]["stats"]["return_submitted"] = True
            job["route"]["stats"]["return_submitted_at"] = timestamp

        failed_stops = [s for s in job.get("delivery_points", []) if s.get("status") == "Failed"]

        return {
            "job_id": job_id,
            "driver_id": driver_id,
            "driver_status": driver["status"],
            "job_status": job["status"],
            "returned_to_hub_at": timestamp,
            "undelivered_items_count": len(failed_stops),
            "failed_stops": failed_stops,
            "message": "Returned to Hub successfully. Awaiting Admin physical verification of undelivered packages."
        }

    def verify_return_at_hub(
        self,
        job_id: str,
        admin_id: str = "admin"
    ) -> Dict[str, Any]:
        """
        Admin verifies and confirms that returned deliverables have arrived at the Central Hub.
        Updates undelivered items to 'Returned & Checked In', completes the job, and frees the driver.
        """
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found.")

        timestamp = time.strftime("%H:%M:%S")
        job["status"] = "Completed (Returns Checked In)"
        job["verified_at"] = timestamp
        job["verified_by"] = admin_id

        # Mark all failed items as checked in
        for s in job.get("delivery_points", []):
            if s.get("status") == "Failed":
                s["status"] = "Returned to Hub & Checked In"
                s["verified_at"] = timestamp
                s["verified_by"] = admin_id

        # Release the driver so they can accept new jobs
        assigned_driver_id = job.get("assigned_driver_id")
        if assigned_driver_id and assigned_driver_id in self.drivers:
            d = self.drivers[assigned_driver_id]
            d["status"] = "Available"
            d["current_job_id"] = None
            d["active_route"] = None

        if job.get("route") and "stats" in job["route"]:
            job["route"]["stats"]["verified"] = True
            job["route"]["stats"]["verified_at"] = timestamp
            job["route"]["stats"]["verified_by"] = admin_id

        return {
            "job_id": job_id,
            "job_status": job["status"],
            "verified_at": timestamp,
            "verified_by": admin_id,
            "released_driver_id": assigned_driver_id,
            "message": "Returned packages successfully verified and checked into Hub warehouse. Driver released."
        }

    def _calculate_qpso_driver_route(
        self,
        origin: Dict[str, Any],
        delivery_points: List[Dict[str, Any]],
        adapter=None,
        return_to_hub: bool = False
    ) -> Dict[str, Any]:
        """
        Uses QPSO to determine the optimal delivery order starting from the Hub/depot,
        and generates traffic-aware road polylines, legs, and Google Maps link.
        If return_to_hub is True (e.g. some items failed delivery), appends return leg to the Hub.
        """
        hub = self.depot
        if not delivery_points:
            return {
                "sequence_str": "Return to Hub" if return_to_hub else "Empty Route",
                "sequence": ["Return to Hub 🏢"] if return_to_hub else [],
                "stops": [],
                "remaining_stops": [],
                "returning_to_hub": return_to_hub,
                "polyline": [[hub["lat"], hub["lng"]]] if return_to_hub else [],
                "legs": [],
                "total_distance_km": 0.0,
                "total_time_min": 0.0,
                "traffic_condition": "Free Flow",
                "traffic_color": "#10b981",
                "google_maps_url": "",
                "stats": {"total_stops": 0, "delivered": 0, "failed": 0, "remaining": 0, "completion_pct": 100.0, "next_stop": None}
            }

        # If adapter provided, run real QPSO optimization
        if adapter:
            try:
                # Each route starts from the hub
                env = adapter.create_real_world_environment(
                    depot=hub,
                    delivery_points=delivery_points,
                    num_vehicles=1,
                    vehicle_capacity=100.0
                )
                res = adapter.solve_and_generate_road_routes(
                    env=env,
                    algorithm="qpso",
                    num_particles=25,
                    max_iterations=50
                )
                v_routes = res.get("vehicle_routes", [])
                if v_routes:
                    vr = v_routes[0]
                    # Use assigned_points (full dicts with lat/lng) — NOT assigned_stops (raw label strings)
                    assigned_stops = vr.get("assigned_points", [])
                    # Fallback: if assigned_points missing, try assigned_stops but only if they're dicts
                    if not assigned_stops:
                        raw_stops = vr.get("assigned_stops", [])
                        assigned_stops = [s for s in raw_stops if isinstance(s, dict)]
                    raw_poly = vr.get("polyline", [])
                    # Normalize polyline to [[lat, lng], ...] for Leaflet
                    polyline = [
                        [p["lat"], p["lng"]] if isinstance(p, dict) else [p[0], p[1]]
                        for p in raw_poly
                    ]
                    # Ensure polyline starts from the Hub
                    if polyline and (abs(polyline[0][0] - hub["lat"]) > 0.0005 or abs(polyline[0][1] - hub["lng"]) > 0.0005):
                        polyline.insert(0, [hub["lat"], hub["lng"]])

                    legs = list(vr.get("legs", []))
                    dist = float(vr.get("total_distance_km", 0.0))
                    t_time = float(vr.get("total_time_min", 0.0))
                    t_color = vr.get("traffic_color", "#10b981")
                    t_cond = vr.get("traffic_condition", "Low Traffic (Free Flow)")

                    # Sequence labels start with Hub
                    seq_labels = [s.get("label", s.get("name", "Stop")) for s in assigned_stops]

                    if return_to_hub and assigned_stops:
                        last_pt = assigned_stops[-1]
                        hub_d = ((hub["lat"] - last_pt["lat"])**2 + (hub["lng"] - last_pt["lng"])**2)**0.5 * 111.0
                        hub_t = (hub_d / 28.0) * 60.0
                        polyline.append([hub["lat"], hub["lng"]])
                        legs.append({
                            "from_name": last_pt.get("name", "Last Stop"),
                            "to_name": f"Return to Hub ({hub.get('name', 'Depot')})",
                            "distance_km": round(hub_d, 2),
                            "time_min": round(hub_t, 1),
                            "traffic_condition": "Free Flow",
                            "traffic_color": "#8b5cf6"
                        })
                        dist += hub_d
                        t_time += hub_t
                        seq_labels.append("Return to Hub 🏢")

                    seq_str = f"Hub → {' → '.join(seq_labels)}" if seq_labels else "Hub"

                    # Generate Google Maps live traffic navigation URL
                    coords_waypoints = [f"{s['lat']},{s['lng']}" for s in assigned_stops]
                    origin_str = f"{origin['lat']},{origin['lng']}"
                    destination_str = f"{hub['lat']},{hub['lng']}" if return_to_hub else (coords_waypoints[-1] if coords_waypoints else origin_str)
                    mid_waypoints = "|".join(coords_waypoints) if return_to_hub else ("|".join(coords_waypoints[:-1]) if len(coords_waypoints) > 1 else "")

                    google_url = f"https://www.google.com/maps/dir/?api=1&origin={quote(origin_str)}&destination={quote(destination_str)}"
                    if mid_waypoints:
                        google_url += f"&waypoints={quote(mid_waypoints)}"
                    google_url += "&travelmode=driving"

                    next_stop = assigned_stops[0] if assigned_stops else None

                    all_points = delivery_points
                    n_delivered = sum(1 for p in all_points if p.get("status") == "Delivered")
                    n_failed = sum(1 for p in all_points if p.get("status") == "Failed")
                    n_total = len(all_points)

                    return {
                        "sequence_str": seq_str,
                        "sequence": seq_labels,
                        "stops": assigned_stops,
                        "remaining_stops": assigned_stops,
                        "returning_to_hub": return_to_hub,
                        "polyline": polyline,
                        "legs": legs,
                        "total_distance_km": round(dist, 2),
                        "total_time_min": round(t_time, 1),
                        "traffic_condition": t_cond,
                        "traffic_color": t_color,
                        "google_maps_url": google_url,
                        "stats": {
                            "total_stops": n_total,
                            "delivered": n_delivered,
                            "failed": n_failed,
                            "remaining": n_total - n_delivered - n_failed,
                            "completion_pct": round((n_delivered / n_total) * 100, 1) if n_total else 100.0,
                            "next_stop": next_stop
                        }
                    }
            except Exception as err:
                print(f"QPSO route solve warning: {err}")

        # Fallback heuristic calculation if adapter fails or not provided
        ordered_stops = list(delivery_points)
        # Polyline always starts from depot/hub
        polyline = [[hub["lat"], hub["lng"]]] + [[p["lat"], p["lng"]] for p in ordered_stops]
        seq_labels = [p.get("label", f"D{i+1}") for i, p in enumerate(ordered_stops)]

        # Distances and travel times
        total_dist = 0.0
        legs = []
        prev = hub
        for s in ordered_stops:
            d_km = ((s["lat"] - prev["lat"])**2 + (s["lng"] - prev["lng"])**2)**0.5 * 111.0
            total_dist += d_km
            time_m = (d_km / 28.0) * 60.0
            legs.append({
                "from_name": prev.get("name", "Hub"),
                "to_name": s.get("name", "Stop"),
                "distance_km": round(d_km, 2),
                "time_min": round(time_m, 1),
                "traffic_condition": "Moderate Traffic",
                "traffic_color": "#f59e0b"
            })
            prev = s

        if return_to_hub and ordered_stops:
            last_pt = ordered_stops[-1]
            hub_d = ((hub["lat"] - last_pt["lat"])**2 + (hub["lng"] - last_pt["lng"])**2)**0.5 * 111.0
            hub_t = (hub_d / 28.0) * 60.0
            polyline.append([hub["lat"], hub["lng"]])
            legs.append({
                "from_name": last_pt.get("name", "Last Stop"),
                "to_name": f"Return to Hub ({hub.get('name', 'Depot')})",
                "distance_km": round(hub_d, 2),
                "time_min": round(hub_t, 1),
                "traffic_condition": "Free Flow",
                "traffic_color": "#8b5cf6"
            })
            total_dist += hub_d
            seq_labels.append("Return to Hub 🏢")

        seq_str = f"Hub → {' → '.join(seq_labels)}" if seq_labels else "Hub"
        total_time = (total_dist / 28.0) * 60.0

        coords_waypoints = [f"{s['lat']},{s['lng']}" for s in ordered_stops]
        origin_str = f"{origin['lat']},{origin['lng']}"
        dest_str = f"{hub['lat']},{hub['lng']}" if return_to_hub else (coords_waypoints[-1] if coords_waypoints else origin_str)
        mid_waypoints = "|".join(coords_waypoints) if return_to_hub else ("|".join(coords_waypoints[:-1]) if len(coords_waypoints) > 1 else "")
        google_url = f"https://www.google.com/maps/dir/?api=1&origin={quote(origin_str)}&destination={quote(dest_str)}"
        if mid_waypoints:
            google_url += f"&waypoints={quote(mid_waypoints)}"
        google_url += "&travelmode=driving"

        all_points = delivery_points  # includes Failed + Delivered for stats
        n_delivered = sum(1 for p in all_points if p.get("status") == "Delivered")
        n_failed = sum(1 for p in all_points if p.get("status") == "Failed")
        n_total = len(all_points)

        return {
            "sequence_str": seq_str,
            "sequence": seq_labels,
            "stops": ordered_stops,
            "remaining_stops": ordered_stops,
            "returning_to_hub": return_to_hub,
            "polyline": polyline,
            "legs": legs,
            "total_distance_km": round(total_dist, 2),
            "total_time_min": round(total_time, 1),
            "traffic_condition": "Moderate Traffic",
            "traffic_color": "#f59e0b",
            "google_maps_url": google_url,
            "stats": {
                "total_stops": n_total,
                "delivered": n_delivered,
                "failed": n_failed,
                "remaining": n_total - n_delivered - n_failed,
                "completion_pct": round((n_delivered / n_total) * 100, 1) if n_total else 100.0,
                "next_stop": ordered_stops[0] if ordered_stops else None
            }
        }

    def release_driver(self, driver_id: str) -> Dict[str, Any]:
        """
        Releases a driver after job completion:
        Sets driver status to 'Available', clears current_job_id and active_route.
        Updates admin fleet live monitoring immediately.
        """
        driver = self.drivers.get(driver_id)
        if not driver:
            raise ValueError(f"Driver {driver_id} not found.")

        old_job_id = driver.get("current_job_id")
        if old_job_id and old_job_id in self.jobs:
            job = self.jobs[old_job_id]
            if job.get("status") not in ["Completed", "Completed (Returns Checked In)", "Completed with Failures"]:
                job["status"] = "Completed"
                job["completed_at"] = time.strftime("%H:%M:%S")

        driver["status"] = "Available"
        driver["current_job_id"] = None
        driver["active_route"] = None

        return {
            "driver_id": driver_id,
            "status": "Available",
            "released_from_job": old_job_id,
            "message": f"Driver {driver_id} successfully released to Available."
        }

    def get_driver_view(self, driver_id: str) -> Dict[str, Any]:
        """
        Returns active state for a specific driver:
        - Current driver profile and status
        - Active accepted job (if any)
        - Available jobs list (if driver is currently unassigned)
        """
        driver = self.drivers.get(driver_id)
        if not driver:
            raise ValueError(f"Driver {driver_id} not found.")

        current_job = None
        if driver.get("current_job_id"):
            current_job = self.jobs.get(driver["current_job_id"])

        available_jobs = self.get_available_jobs()

        return {
            "driver": driver,
            "current_job": current_job,
            "available_jobs": available_jobs,
            "has_active_job": bool(current_job and current_job.get("status") in [
                "Accepted", "In Progress", "En Route", "Delivering", "Returning to Hub", "Pending Admin Verification"
            ])
        }

    def get_admin_fleet_live(self) -> Dict[str, Any]:
        """
        Returns complete fleet status, active driver GPS coordinates,
        assigned routes, and all delivery stops with completed vs pending states
        for real-time Admin Dashboard monitoring.
        """
        drivers_status = []
        all_delivery_stops = []
        active_routes = []

        for d_id, d_info in self.drivers.items():
            job = self.jobs.get(d_info.get("current_job_id")) if d_info.get("current_job_id") else None
            stops = job.get("delivery_points", []) if job else []
            completed = sum(1 for s in stops if s.get("status") == "Delivered")
            failed_count = sum(1 for s in stops if s.get("status") == "Failed")
            remaining = len(stops) - completed - failed_count

            drivers_status.append({
                "driver_id": d_id,
                "driver_name": d_info.get("driver_name"),
                "vehicle": d_info.get("assigned_vehicle"),
                "status": d_info.get("status"),
                "accepted_job_id": job.get("job_id") if job else None,
                "current_location": d_info.get("current_location"),
                "completed_count": completed,
                "failed_count": failed_count,
                "remaining_count": remaining,
                "total_stops": len(stops),
                "route_color": d_info.get("route_color", "#10b981")
            })

            if job and d_info.get("active_route"):
                active_routes.append({
                    "driver_id": d_id,
                    "driver_name": d_info.get("driver_name"),
                    "vehicle": d_info.get("assigned_vehicle"),
                    "job_id": job.get("job_id"),
                    "route_color": d_info.get("route_color", "#10b981"),
                    "polyline": d_info["active_route"].get("polyline", []),
                    "total_distance_km": d_info["active_route"].get("total_distance_km", 0.0),
                    "total_time_min": d_info["active_route"].get("total_time_min", 0.0),
                    "traffic_condition": d_info["active_route"].get("traffic_condition", "Normal"),
                    "traffic_color": d_info["active_route"].get("traffic_color", "#10b981")
                })

            for s in stops:
                all_delivery_stops.append({
                    "id": s.get("id"),
                    "label": s.get("label"),
                    "name": s.get("name"),
                    "lat": s.get("lat"),
                    "lng": s.get("lng"),
                    "demand": s.get("demand"),
                    "status": s.get("status", "Pending"),
                    "delivered_at": s.get("delivered_at"),
                    # Failed delivery fields — visible to admin
                    "failed_reason": s.get("failed_reason"),
                    "failed_at": s.get("failed_at"),
                    "failed_by": s.get("failed_by"),
                    "assigned_driver_id": d_id,
                    "assigned_driver_name": d_info.get("driver_name"),
                    "assigned_vehicle": d_info.get("assigned_vehicle"),
                    "job_id": job.get("job_id") if job else None,
                    "color": d_info.get("route_color", "#10b981")
                })


        # Assemble jobs awaiting admin verification of returned undelivered packages
        pending_verifications = []
        for j_id, j in self.jobs.items():
            failed_items = [
                {
                    "id": s.get("id"),
                    "label": s.get("label"),
                    "name": s.get("name"),
                    "demand": s.get("demand"),
                    "failed_reason": s.get("failed_reason"),
                    "failed_at": s.get("failed_at"),
                    "status": s.get("status")
                }
                for s in j.get("delivery_points", [])
                if s.get("status") in ["Failed", "Returned to Hub & Checked In"]
            ]
            if len(failed_items) > 0 and (j.get("status") in ["Pending Admin Verification", "Returning to Hub", "Completed with Failures"]):
                pending_verifications.append({
                    "job_id": j_id,
                    "title": j.get("title"),
                    "driver_id": j.get("assigned_driver_id"),
                    "driver_name": j.get("assigned_driver_name"),
                    "vehicle": j.get("assigned_vehicle"),
                    "job_status": j.get("status"),
                    "returned_to_hub_at": j.get("returned_to_hub_at"),
                    "undelivered_items": failed_items,
                    "undelivered_count": len(failed_items),
                    "is_awaiting_verification": j.get("status") == "Pending Admin Verification"
                })

        return {
            "depot": self.depot,
            "drivers": drivers_status,
            "active_routes": active_routes,
            "delivery_stops": all_delivery_stops,
            "pending_verifications": pending_verifications,
            "total_available_jobs": len(self.get_available_jobs()),
            "total_jobs": len(self.jobs),
            "timestamp": time.time()
        }

    def publish_new_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Allows Admin to create and publish a new delivery job into the available pool."""
        job_id = job_data.get("job_id") or f"JOB-OPT-{int(time.time()) % 10000}"
        delivery_points = job_data.get("delivery_points", [])

        new_job = {
            "job_id": job_id,
            "title": job_data.get("title", f"Optimized Fleet Batch ({len(delivery_points)} stops)"),
            "priority": job_data.get("priority", "High Priority"),
            "status": "Available",
            "assigned_driver_id": None,
            "assigned_driver_name": None,
            "assigned_vehicle": None,
            "num_deliveries": len(delivery_points),
            "total_distance_km": float(job_data.get("total_distance_km", 22.0)),
            "estimated_time_min": float(job_data.get("estimated_time_min", 45.0)),
            "traffic_condition": job_data.get("traffic_condition", "Moderate Traffic"),
            "traffic_color": job_data.get("traffic_color", "#f59e0b"),
            "created_at": time.strftime("%H:%M:%S"),
            "accepted_at": None,
            "completed_at": None,
            "depot": self.depot,
            "delivery_points": [
                {
                    "id": p.get("id", f"{job_id}-d{idx+1}"),
                    "label": p.get("label", f"D{idx+1}"),
                    "name": p.get("name", f"Delivery Stop {idx+1}"),
                    "lat": float(p.get("lat", 0.0)),
                    "lng": float(p.get("lng", 0.0)),
                    "demand": float(p.get("demand", 10.0)),
                    "status": "Pending"
                }
                for idx, p in enumerate(delivery_points)
            ],
            "route": None
        }

        self.jobs[job_id] = new_job
        for pt in new_job.get("delivery_points", []):
            self.generate_otp_for_stop(pt["id"], pt.get("name", "Customer"))
        return new_job

    # Backward-compatibility wrappers
    def get_driver_route(self, driver_id: str) -> Optional[Dict[str, Any]]:
        driver = self.drivers.get(driver_id)
        if not driver:
            return None
        if driver.get("active_route"):
            res = dict(driver["active_route"])
            res["driver_id"] = driver_id
            res["driver_name"] = driver["driver_name"]
            res["assigned_vehicle"] = driver["assigned_vehicle"]
            res["status"] = driver["status"]
            return res

        # Check if driver has an accepted job
        if driver.get("current_job_id"):
            job = self.jobs.get(driver["current_job_id"])
            if job and job.get("route"):
                res = dict(job["route"])
                res["driver_id"] = driver_id
                res["driver_name"] = driver["driver_name"]
                res["assigned_vehicle"] = driver["assigned_vehicle"]
                res["status"] = driver["status"]
                return res

        return None

    def update_delivery_status(self, driver_id: str, stop_id: str, new_status: str) -> Optional[Dict[str, Any]]:
        driver = self.drivers.get(driver_id)
        if not driver or not driver.get("current_job_id"):
            return None
        job = self.jobs.get(driver["current_job_id"])
        if not job:
            return None

        for s in job.get("delivery_points", []):
            if s.get("id") == stop_id or s.get("label") == stop_id:
                s["status"] = new_status
                if new_status == "Delivered":
                    s["delivered_at"] = time.strftime("%H:%M:%S")
                return s
        return None

    def get_admin_dispatch_overview(self) -> Dict[str, Any]:
        return self.get_admin_fleet_live()

    # ──────────────────────────────────────────────────────────────────
    # OTP MANAGEMENT SYSTEM
    # ──────────────────────────────────────────────────────────────────

    def _hash_otp(self, otp: str) -> str:
        """Return SHA-256 hash of the OTP string."""
        return hashlib.sha256(otp.encode()).hexdigest()

    def generate_otp_for_stop(self, stop_id: str, customer_name: str = "Customer") -> Dict[str, Any]:
        """
        Generates a 6-digit OTP for a specific delivery stop.
        Creates a secure delivery token for the customer dashboard.
        Returns plaintext OTP (shown only once — to be provided to customer).
        """
        otp = str(random.randint(100000, 999999))
        customer_token = secrets.token_urlsafe(16)

        self.otp_store[stop_id] = {
            "otp_hash": self._hash_otp(otp),
            "otp_display": otp,       # stored for customer dashboard display
            "expiry": time.time() + 30 * 60,  # 30 minutes
            "attempts": 0,
            "verified": False,
            "customer_token": customer_token,
            "generated_at": time.strftime("%H:%M:%S"),
            "customer_name": customer_name,
            "last_regenerated_at": None,
        }
        self.customer_tokens[customer_token] = stop_id

        # Attach customer_token to the stop in the job
        for job in self.jobs.values():
            for pt in job.get("delivery_points", []):
                if pt.get("id") == stop_id:
                    pt["customer_token"] = customer_token
                    pt["customer_name"] = customer_name
                    pt["otp_status"] = "Active"
                    break

        return {
            "stop_id": stop_id,
            "otp": otp,           # plaintext — shown once to customer
            "customer_token": customer_token,
            "expires_in_minutes": 30,
        }

    def get_customer_delivery_status(self, delivery_token: str) -> Dict[str, Any]:
        """
        Returns delivery status for a customer given their unique delivery token or delivery stop ID.
        Customers see only their own stop — no access to other routes, drivers, or customers.
        """
        delivery_token = delivery_token.strip()
        stop_id = self.customer_tokens.get(delivery_token)
        
        # Fallback: allow lookup directly by stop_id/delivery_id if token not found in mapping
        if not stop_id:
            if delivery_token in self.otp_store:
                stop_id = delivery_token
            else:
                for job in self.jobs.values():
                    for pt in job.get("delivery_points", []):
                        if pt.get("id") == delivery_token or pt.get("label") == delivery_token:
                            stop_id = pt.get("id")
                            # If OTP not generated yet, auto-generate now
                            if stop_id not in self.otp_store:
                                self.generate_otp_for_stop(stop_id, pt.get("name", "Customer"))
                            break
                    if stop_id:
                        break

        if not stop_id:
            raise ValueError(f"No delivery found matching '{delivery_token}'. Please verify your Delivery Token or Delivery ID.")

        otp_info = self.otp_store.get(stop_id, {})

        # Find the stop and job
        target_stop = None
        target_job = None
        for job in self.jobs.values():
            for pt in job.get("delivery_points", []):
                if pt.get("id") == stop_id:
                    target_stop = pt
                    target_job = job
                    break
            if target_stop:
                break

        if not target_stop:
            raise ValueError("Delivery not found. The stop may have been removed.")

        # Determine OTP status without exposing the OTP hash
        otp_status = "Active"
        if otp_info.get("verified"):
            otp_status = "Verified"
        elif otp_info.get("expiry") and time.time() > otp_info["expiry"]:
            otp_status = "Expired"

        # Determine tracking state
        stop_status = target_stop.get("status", "Pending")
        tracking_states = {
            "Pending": {"step": 1, "label": "📦 Order Confirmed", "description": "Your package is at the hub, ready for pickup."},
            "In Progress": {"step": 2, "label": "🚚 Out for Delivery", "description": "Your package is on the way."},
            "Failed": {"step": 5, "label": "⚠️ Delivery Attempted", "description": f"Delivery could not be completed: {target_stop.get('failed_reason', 'Unknown reason')}"},
            "Delivered": {"step": 5, "label": "✅ Delivered", "description": "Your package has been delivered successfully."},
            "Returned to Hub & Checked In": {"step": 5, "label": "🏢 Returned to Hub", "description": "Package returned to hub for re-scheduling."},
        }
        tracking = tracking_states.get(stop_status, {"step": 2, "label": "🚚 Out for Delivery", "description": "Your package is on the way."})

        # Driver info (only current status, no route details)
        driver_name = None
        driver_status = None
        if target_job:
            driver_id = target_job.get("assigned_driver_id")
            if driver_id and driver_id in self.drivers:
                d = self.drivers[driver_id]
                driver_name = d.get("driver_name")
                driver_status = d.get("status")

        # Estimate stops before this delivery (pending stops ahead in job)
        stops_before = 0
        if target_job:
            all_pts = target_job.get("delivery_points", [])
            for pt in all_pts:
                if pt.get("id") == stop_id:
                    break
                if pt.get("status") in ["Pending", "In Progress"]:
                    stops_before += 1

        # Estimated arrival time based on remaining stops
        eta_min = stops_before * 12 + 5  # rough 12 min per stop

        # Generate OTP to display (from otp_store, not re-generate)
        # We store the plaintext OTP display SEPARATELY from hash for customer display
        otp_display = otp_info.get("otp_display")  # set during generate

        return {
            "delivery_id": stop_id,
            "delivery_token": delivery_token,
            "customer_name": otp_info.get("customer_name", "Customer"),
            "destination": {
                "name": target_stop.get("name"),
                "lat": target_stop.get("lat"),
                "lng": target_stop.get("lng"),
            },
            "status": stop_status,
            "tracking_step": tracking["step"],
            "tracking_label": tracking["label"],
            "tracking_description": tracking["description"],
            "driver_name": driver_name,
            "driver_status": driver_status,
            "stops_before": stops_before,
            "eta_minutes": eta_min,
            "otp_status": otp_status,
            "otp_display": otp_display,     # None if expired/used
            "otp_generated_at": otp_info.get("generated_at"),
            "failed_reason": target_stop.get("failed_reason"),
            "delivered_at": target_stop.get("delivered_at"),
            "job_status": target_job.get("status") if target_job else None,
            "depot": self.depot,
        }

    def verify_otp_for_delivery(
        self,
        stop_id: str,
        otp_entered: str,
        driver_id: str,
        driver_gps: Optional[Dict[str, float]] = None,
        adapter=None
    ) -> Dict[str, Any]:
        """
        Driver-side OTP verification for a delivery stop.
        Backend is source of truth — frontend never decides validity.
        Enforces: correct stop, correct OTP, not expired, not already used, max 5 attempts.
        On success: marks stop as Delivered (same as complete_delivery).
        """
        otp_info = self.otp_store.get(stop_id)
        if not otp_info:
            raise ValueError("No OTP exists for this delivery. Please check the stop ID.")

        # Max attempts check (rate limiting)
        if otp_info["attempts"] >= 5:
            raise ValueError("Too many failed OTP attempts. Delivery locked. Contact admin.")

        # Already verified
        if otp_info["verified"]:
            raise ValueError("OTP already used. This delivery has already been verified.")

        # Expiry check
        if time.time() > otp_info["expiry"]:
            raise ValueError("OTP has expired. Customer must request a new OTP.")

        # Verify OTP hash
        entered_hash = self._hash_otp(otp_entered.strip())
        if entered_hash != otp_info["otp_hash"]:
            otp_info["attempts"] += 1
            remaining = 5 - otp_info["attempts"]
            raise ValueError(f"Invalid OTP. {remaining} attempt(s) remaining.")

        # OTP is correct — mark as verified
        otp_info["verified"] = True
        otp_info["verified_at"] = time.strftime("%H:%M:%S")
        otp_info["verified_by"] = driver_id
        otp_info["otp_display"] = None  # clear display once verified

        # Update OTP status on the stop
        for job in self.jobs.values():
            for pt in job.get("delivery_points", []):
                if pt.get("id") == stop_id:
                    pt["otp_status"] = "Verified"
                    pt["otp_verified_at"] = time.strftime("%H:%M:%S")
                    break

        # Now complete the delivery (same logic as complete_delivery)
        result = self.complete_delivery(
            driver_id=driver_id,
            job_id=self._get_job_id_for_stop(stop_id),
            stop_id=stop_id,
            driver_gps=driver_gps or {},
            adapter=adapter
        )

        return {
            "success": True,
            "stop_id": stop_id,
            "verified_at": otp_info["verified_at"],
            "message": "OTP verified successfully. Delivery marked as completed.",
            **result
        }

    def regenerate_otp(self, delivery_token: str) -> Dict[str, Any]:
        """
        Customer requests a new OTP after expiry.
        Rate-limited: at most once every 5 minutes.
        """
        stop_id = self.customer_tokens.get(delivery_token)
        if not stop_id:
            raise ValueError("Invalid delivery token.")

        otp_info = self.otp_store.get(stop_id)
        if not otp_info:
            raise ValueError("No OTP record found for this delivery.")

        if otp_info.get("verified"):
            raise ValueError("Delivery already verified. No new OTP needed.")

        # Rate limit: 5 minutes between regenerations
        last_regen = otp_info.get("last_regenerated_at")
        if last_regen and (time.time() - last_regen) < 300:
            remaining_sec = int(300 - (time.time() - last_regen))
            raise ValueError(f"Please wait {remaining_sec} seconds before requesting a new OTP.")

        # Generate new OTP
        new_otp = str(random.randint(100000, 999999))
        otp_info["otp_hash"] = self._hash_otp(new_otp)
        otp_info["expiry"] = time.time() + 30 * 60
        otp_info["attempts"] = 0
        otp_info["generated_at"] = time.strftime("%H:%M:%S")
        otp_info["last_regenerated_at"] = time.time()
        otp_info["otp_display"] = new_otp

        # Update stop's OTP status
        for job in self.jobs.values():
            for pt in job.get("delivery_points", []):
                if pt.get("id") == stop_id:
                    pt["otp_status"] = "Active"
                    break

        return {
            "stop_id": stop_id,
            "otp": new_otp,
            "expires_in_minutes": 30,
            "message": "New OTP generated successfully.",
        }

    def _get_job_id_for_stop(self, stop_id: str) -> str:
        """Find the job_id that contains the given stop_id."""
        for job in self.jobs.values():
            for pt in job.get("delivery_points", []):
                if pt.get("id") == stop_id:
                    return job["job_id"]
        raise ValueError(f"Stop {stop_id} not found in any job.")

    def get_admin_otp_verification_table(self) -> List[Dict[str, Any]]:
        """
        Admin-only endpoint: Returns OTP verification table.
        Shows OTP status (Active/Expired/Verified) — NEVER the actual OTP code.
        """
        rows = []
        for job in self.jobs.values():
            for pt in job.get("delivery_points", []):
                stop_id = pt.get("id")
                otp_info = self.otp_store.get(stop_id, {})
                if not otp_info:
                    continue

                otp_status = "Active"
                if otp_info.get("verified"):
                    otp_status = "Verified"
                elif otp_info.get("expiry") and time.time() > otp_info["expiry"]:
                    otp_status = "Expired"

                customer_token = otp_info.get("customer_token") or pt.get("customer_token") or stop_id
                rows.append({
                    "delivery_id": stop_id,
                    "stop_name": pt.get("name"),
                    "customer_name": otp_info.get("customer_name", "Customer"),
                    "customer_token": customer_token,
                    "tracking_url": f"http://localhost:3000?customer={customer_token}",
                    "driver_name": job.get("assigned_driver_name"),
                    "delivery_status": pt.get("status", "Pending"),
                    "otp_status": otp_status,              # NEVER the actual OTP
                    "otp_attempts": otp_info.get("attempts", 0),
                    "verified_at": otp_info.get("verified_at"),
                    "generated_at": otp_info.get("generated_at"),
                    "job_id": job.get("job_id"),
                })
        return rows

    def update_from_optimization_result(self, result: Dict[str, Any], depot: Dict[str, Any], delivery_points: List[Dict[str, Any]]):
        """Creates new available jobs from QPSO optimization runs."""
        self.depot = depot
        self.last_optimized_at = time.time()
        vehicle_routes = result.get("vehicle_routes", [])

        # Clean out any old dummy JOB-DEL-* jobs or stale unassigned available jobs
        self.jobs = {k: v for k, v in self.jobs.items() if not k.startswith("JOB-DEL-") and v.get("status") != "Available"}

        for idx, vr in enumerate(vehicle_routes):
            # Use assigned_points (full dicts) — NOT assigned_stops (string labels)
            assigned_stops = vr.get("assigned_points", [])
            # Fallback: if assigned_points not present, try assigned_stops filtered to dicts only
            if not assigned_stops:
                raw_stops = vr.get("assigned_stops", [])
                assigned_stops = [s for s in raw_stops if isinstance(s, dict)]
            if not assigned_stops:
                continue

            # Normalize polyline to [[lat, lng], ...] for Leaflet
            raw_poly = vr.get("polyline", [])
            normalized_poly = [
                [p["lat"], p["lng"]] if isinstance(p, dict) else [p[0], p[1]]
                for p in raw_poly
            ]

            # Build sequence string
            seq_labels = [s.get("label", s.get("name", f"D{i+1}")) for i, s in enumerate(assigned_stops)]
            seq_str = " → ".join(seq_labels) if seq_labels else "Depot"

            # Google Maps URL for pre-calculated route
            origin_str = f"{depot['lat']},{depot['lng']}"
            coords_waypoints = [f"{s['lat']},{s['lng']}" for s in assigned_stops]
            destination_str = coords_waypoints[-1] if coords_waypoints else origin_str
            mid_waypoints = "|".join(coords_waypoints[:-1]) if len(coords_waypoints) > 1 else ""
            google_url = f"https://www.google.com/maps/dir/?api=1&origin={quote(origin_str)}&destination={quote(destination_str)}"
            if mid_waypoints:
                google_url += f"&waypoints={quote(mid_waypoints)}"
            google_url += "&travelmode=driving"

            dist = float(vr.get("total_distance_km", 20.0))
            t_time = float(vr.get("total_time_min", 40.0))
            t_cond = vr.get("traffic_condition", "Moderate Traffic")
            t_color = vr.get("traffic_color", "#f59e0b")

            job_id = f"JOB-OPT-{idx+1}"
            self.jobs[job_id] = {
                "job_id": job_id,
                "title": f"QPSO Route {idx+1} ({len(assigned_stops)} stops)",
                "priority": "High Priority" if idx == 0 else "Express",
                "status": "Available",
                "assigned_driver_id": None,
                "assigned_driver_name": None,
                "assigned_vehicle": None,
                "num_deliveries": len(assigned_stops),
                "total_distance_km": dist,
                "estimated_time_min": t_time,
                "traffic_condition": t_cond,
                "traffic_color": t_color,
                "created_at": time.strftime("%H:%M:%S"),
                "accepted_at": None,
                "completed_at": None,
                "depot": depot,
                "delivery_points": [
                    {
                        "id": s.get("id", f"{job_id}-d{s_idx+1}"),
                        "label": s.get("label", f"D{s_idx+1}"),
                        "name": s.get("name", f"Delivery Stop {s_idx+1}"),
                        "lat": float(s.get("lat", 0.0)),
                        "lng": float(s.get("lng", 0.0)),
                        "demand": float(s.get("demand", 10.0)),
                        "status": "Pending"
                    }
                    for s_idx, s in enumerate(assigned_stops)
                ],
                # Pre-populate route so driver dashboard renders immediately on accept
                "route": {
                    "sequence_str": seq_str,
                    "sequence": seq_labels,
                    "stops": assigned_stops,
                    "remaining_stops": assigned_stops,
                    "polyline": normalized_poly,
                    "legs": vr.get("legs", []),
                    "total_distance_km": dist,
                    "total_time_min": t_time,
                    "traffic_condition": t_cond,
                    "traffic_color": t_color,
                    "google_maps_url": google_url,
                    "stats": {
                        "total_stops": len(assigned_stops),
                        "delivered": 0,
                        "remaining": len(assigned_stops),
                        "completion_pct": 0.0,
                        "next_stop": assigned_stops[0] if assigned_stops else None
                    }
                }
            }
            for pt in self.jobs[job_id].get("delivery_points", []):
                self.generate_otp_for_stop(pt["id"], pt.get("name", "Customer"))


# Singleton instance
dispatch_manager = DispatchManager()
