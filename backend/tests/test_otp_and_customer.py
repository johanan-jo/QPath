import pytest
import httpx
from main import app
from core.dispatch_manager import dispatch_manager
from api.auth import create_access_token


@pytest.fixture(scope="module", autouse=True)
def setup_test_jobs():
    """Seed demo jobs with OTPs for tests, clean up afterwards."""
    dispatch_manager.seed_demo_jobs()
    yield
    dispatch_manager.clear_all_jobs()


def get_admin_token():
    return create_access_token({"sub": "admin", "role": "admin", "name": "Admin"})


def get_driver_token():
    return create_access_token({"sub": "driver1", "role": "driver", "driver_id": "driver1", "name": "Rajesh Kumar"})


@pytest.mark.asyncio
async def test_otp_generation_and_customer_view():
    admin_headers = {"Authorization": f"Bearer {get_admin_token()}"}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Generate OTP for stop d101-1
        res = await client.post("/api/admin/generate-otp", json={"stop_id": "d101-1", "customer_name": "Priya Sharma"}, headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "otp" in data
        assert len(data["otp"]) == 6
        assert "customer_token" in data
        customer_token = data["customer_token"]
        otp_code = data["otp"]

        # 2. Customer accesses their status using delivery token (no auth header needed)
        c_res = await client.get(f"/api/customer/delivery-status?token={customer_token}")
        assert c_res.status_code == 200
        c_data = c_res.json()
        assert c_data["delivery_id"] == "d101-1"
        assert c_data["customer_name"] == "Priya Sharma"
        assert c_data["otp_status"] == "Active"
        assert c_data["otp_display"] == otp_code
        assert "otp_hash" not in c_data  # secure


@pytest.mark.asyncio
async def test_driver_otp_verification_failure_and_success():
    driver_headers = {"Authorization": f"Bearer {get_driver_token()}"}
    admin_headers = {"Authorization": f"Bearer {get_admin_token()}"}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Driver accepts JOB-DEL-101
        await client.post("/api/driver/accept-job", json={
            "driver_id": "driver1",
            "job_id": "JOB-DEL-101",
            "driver_gps": {"lat": 28.6139, "lng": 77.2090}
        }, headers=driver_headers)

        # Generate fresh OTP for stop d101-2
        otp_res = await client.post("/api/admin/generate-otp", json={"stop_id": "d101-2", "customer_name": "Rahul Verma"}, headers=admin_headers)
        assert otp_res.status_code == 200
        correct_otp = otp_res.json()["otp"]

        # 1. Driver attempts verification with WRONG OTP
        wrong_res = await client.post("/api/driver/verify-otp", json={
            "stop_id": "d101-2",
            "otp": "000000",
            "driver_id": "driver1",
            "driver_gps": {"lat": 28.5672, "lng": 77.2100}
        }, headers=driver_headers)
        assert wrong_res.status_code == 400
        assert "Invalid OTP" in wrong_res.json()["detail"]

        # 2. Driver attempts verification with CORRECT OTP
        correct_res = await client.post("/api/driver/verify-otp", json={
            "stop_id": "d101-2",
            "otp": correct_otp,
            "driver_id": "driver1",
            "driver_gps": {"lat": 28.5672, "lng": 77.2100}
        }, headers=driver_headers)
        assert correct_res.status_code == 200
        assert correct_res.json()["success"] is True


@pytest.mark.asyncio
async def test_admin_otp_verification_table():
    admin_headers = {"Authorization": f"Bearer {get_admin_token()}"}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/admin/otp-verification-table", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert isinstance(data["rows"], list)
        for row in data["rows"]:
            assert "otp_status" in row
            assert "otp" not in row
            assert "otp_hash" not in row
