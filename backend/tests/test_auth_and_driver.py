import pytest
import httpx
from main import app
from core.dispatch_manager import dispatch_manager


@pytest.fixture(scope="module", autouse=True)
def setup_test_jobs():
    """Ensure tests have demo jobs to run driver acceptance and completion flows."""
    dispatch_manager.seed_demo_jobs()
    yield
    dispatch_manager.clear_all_jobs()



@pytest.mark.asyncio
async def test_login_admin_success():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"
        assert data["user"]["username"] == "admin"


@pytest.mark.asyncio
async def test_login_driver_success():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={"username": "driver1", "password": "driver1"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["role"] == "driver"
        assert data["user"]["driver_id"] == "driver1"
        assert data["user"]["assigned_vehicle"] == "Vehicle 1"


@pytest.mark.asyncio
async def test_login_invalid_credentials():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={"username": "admin", "password": "wrongpassword"})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post("/api/auth/login", json={"username": "driver1", "password": "driver1"})
        token = login_resp.json()["token"]

        resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["username"] == "driver1"
        assert resp.json()["role"] == "driver"


@pytest.mark.asyncio
async def test_driver_available_jobs():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post("/api/auth/login", json={"username": "driver1", "password": "driver1"})
        token = login_resp.json()["token"]

        resp = await client.get("/api/driver/available-jobs", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "available_jobs" in data
        assert len(data["available_jobs"]) > 0
        job = data["available_jobs"][0]
        assert "job_id" in job
        assert "delivery_points" in job
        assert "estimated_time_min" in job


@pytest.mark.asyncio
async def test_driver_accept_job_flow():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post("/api/auth/login", json={"username": "driver1", "password": "driver1"})
        token = login_resp.json()["token"]

        # Driver 1 accepts JOB-DEL-101 with GPS coordinates
        driver_gps = {"lat": 28.6139, "lng": 77.2090}
        resp = await client.post(
            "/api/driver/accept-job",
            json={"driver_id": "driver1", "job_id": "JOB-DEL-101", "driver_gps": driver_gps},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["job"]["status"] == "Accepted"
        assert data["job"]["assigned_driver_id"] == "driver1"
        assert "route" in data
        assert "polyline" in data["route"]
        assert "google_maps_url" in data["route"]


@pytest.mark.asyncio
async def test_driver_complete_delivery_and_reroute():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post("/api/auth/login", json={"username": "driver1", "password": "driver1"})
        token = login_resp.json()["token"]

        # Mark first delivery d101-1 as delivered
        driver_gps = {"lat": 28.6129, "lng": 77.2295}
        resp = await client.post(
            "/api/driver/complete-delivery",
            json={
                "driver_id": "driver1",
                "job_id": "JOB-DEL-101",
                "stop_id": "d101-1",
                "driver_gps": driver_gps
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["delivered_stop"]["status"] == "Delivered"
        assert data["remaining_count"] == 3
        # Verify route was re-calculated for remaining stops
        assert "route" in data
        assert "sequence" in data["route"]


@pytest.mark.asyncio
async def test_admin_fleet_live():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        admin_token = login_resp.json()["token"]

        resp = await client.get("/api/admin/fleet-live", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "drivers" in data
        assert "active_routes" in data
        assert "delivery_stops" in data
        # Driver 1 should reflect job accepted / en route
        d1 = next(d for d in data["drivers"] if d["driver_id"] == "driver1")
        assert d1["accepted_job_id"] == "JOB-DEL-101"
        assert d1["completed_count"] >= 1


@pytest.mark.asyncio
async def test_driver_fail_delivery_and_return_to_hub():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post("/api/auth/login", json={"username": "driver1", "password": "driver1"})
        token = login_resp.json()["token"]

        # Mark stop d101-2 as Failed with reason
        fail_resp = await client.post(
            "/api/driver/fail-delivery",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "driver_id": "driver1",
                "job_id": "JOB-DEL-101",
                "stop_id": "d101-2",
                "reason": "Customer unavailable / Not home",
                "driver_gps": {"lat": 28.5672, "lng": 77.2100}
            }
        )
        assert fail_resp.status_code == 200
        data = fail_resp.json()
        assert data["success"] is True
        assert data["failed_stop"]["status"] == "Failed"
        assert "Customer unavailable" in data["failed_stop"]["failed_reason"]

        # Verify admin view reflects the failed reason
        admin_login = await client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        admin_token = admin_login.json()["token"]
        fleet_resp = await client.get("/api/admin/fleet-live", headers={"Authorization": f"Bearer {admin_token}"})
        assert fleet_resp.status_code == 200
        fleet_data = fleet_resp.json()
        failed_stop = next(s for s in fleet_data["delivery_stops"] if s["id"] == "d101-2")
        assert failed_stop["status"] == "Failed"
        assert "Customer unavailable" in failed_stop["failed_reason"]


@pytest.mark.asyncio
async def test_driver_complete_return_and_admin_verify_releases_driver():
    """Verify flow: Driver confirms hub arrival, Admin verifies return, and driver is released to Available."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        driver_login = await client.post("/api/auth/login", json={"username": "driver1", "password": "driver1"})
        driver_token = driver_login.json()["token"]

        # Driver confirms arrival back at Hub
        ret_resp = await client.post(
            "/api/driver/complete-return",
            headers={"Authorization": f"Bearer {driver_token}"},
            json={"driver_id": "driver1", "job_id": "JOB-DEL-101", "driver_gps": {"lat": 28.6139, "lng": 77.2090}}
        )
        assert ret_resp.status_code == 200
        assert ret_resp.json()["job_status"] == "Pending Admin Verification"

        # Admin verifies the return
        admin_login = await client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        admin_token = admin_login.json()["token"]
        ver_resp = await client.post(
            "/api/admin/verify-return",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"job_id": "JOB-DEL-101"}
        )
        assert ver_resp.status_code == 200
        assert ver_resp.json()["job_status"] == "Completed (Returns Checked In)"

        # Check driver view: driver must be released and Available
        dview_resp = await client.get("/api/driver/driver1/view", headers={"Authorization": f"Bearer {driver_token}"})
        assert dview_resp.status_code == 200
        dview = dview_resp.json()
        assert dview["driver"]["status"] == "Available"
        assert dview["driver"]["current_job_id"] is None
        assert dview["has_active_job"] is False

        # Admin fleet-live must also show driver released
        fleet_resp = await client.get("/api/admin/fleet-live", headers={"Authorization": f"Bearer {admin_token}"})
        assert fleet_resp.status_code == 200
        d1 = next(d for d in fleet_resp.json()["drivers"] if d["driver_id"] == "driver1")
        assert d1["status"] == "Available"
        assert d1["accepted_job_id"] is None


@pytest.mark.asyncio
async def test_driver_release_endpoint():
    """Verify that calling /api/driver/release releases the driver and updates admin view."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        driver_login = await client.post("/api/auth/login", json={"username": "driver2", "password": "driver2"})
        driver_token = driver_login.json()["token"]

        rel_resp = await client.post(
            "/api/driver/release",
            headers={"Authorization": f"Bearer {driver_token}"},
            json={"driver_id": "driver2"}
        )
        assert rel_resp.status_code == 200
        assert rel_resp.json()["status"] == "Available"

        dview = (await client.get("/api/driver/driver2/view", headers={"Authorization": f"Bearer {driver_token}"})).json()
        assert dview["driver"]["status"] == "Available"
        assert dview["has_active_job"] is False

