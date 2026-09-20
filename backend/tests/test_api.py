import pytest
import httpx
from main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_graph_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/graph?city=delhi&num_nodes=20")
        assert response.status_code == 200
        data = response.json()
        assert data["city"] == "delhi"
        assert len(data["nodes"]) == 20
        assert len(data["edges"]) > 0


@pytest.mark.asyncio
async def test_traffic_endpoints():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Get traffic
        get_res = await client.get("/api/traffic")
        assert get_res.status_code == 200

        # 2. Update traffic preset
        up_res = await client.post("/api/traffic/update", json={"preset": "heavy"})
        assert up_res.status_code == 200
        assert up_res.json()["preset"] == "heavy"


@pytest.mark.asyncio
async def test_optimize_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "city": "delhi",
            "num_nodes": 20,
            "source_node": 0,
            "num_vehicles": 2,
            "vehicle_capacity": 100.0,
            "num_deliveries": 5,
            "algorithm": "qpso",
            "num_particles": 10,
            "max_iterations": 15,
            "weights": {
                "travel_time": 0.4,
                "distance": 0.3,
                "congestion": 0.2,
                "op_cost": 0.1
            }
        }
        response = await client.post("/api/optimize", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["algorithm"] == "QPSO"
        assert data["best_fitness"] > 0
        assert len(data["best_routes"]) == 2
        assert "route_coords" in data
        assert "graph_data" in data


@pytest.mark.asyncio
async def test_compare_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "city": "delhi",
            "num_nodes": 20,
            "source_node": 0,
            "num_vehicles": 2,
            "vehicle_capacity": 100.0,
            "num_deliveries": 4,
            "algorithm": "all",
            "num_particles": 10,
            "max_iterations": 10
        }
        response = await client.post("/api/compare", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "comparison" in data
        assert len(data["comparison"]) >= 4
