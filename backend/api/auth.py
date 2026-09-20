import time
import jwt
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

SECRET_KEY = "qpath-sih-secret-key-2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_SECONDS = 60 * 60 * 24  # 24 hours

# Demo user credentials as specified
DEMO_USERS: Dict[str, Dict[str, Any]] = {
    "admin": {
        "username": "admin",
        "password": "admin123",
        "role": "admin",
        "name": "Fleet Operations Admin",
        "driver_id": None,
        "assigned_vehicle": None,
    },
    "driver1": {
        "username": "driver1",
        "password": "driver1",
        "role": "driver",
        "name": "Rajesh Kumar",
        "driver_id": "driver1",
        "assigned_vehicle": "Vehicle 1",
    },
    "driver2": {
        "username": "driver2",
        "password": "driver2",
        "role": "driver",
        "name": "Amit Sharma",
        "driver_id": "driver2",
        "assigned_vehicle": "Vehicle 2",
    }
}

security = HTTPBearer(auto_error=False)
auth_router = APIRouter(prefix="/api/auth", tags=["authentication"])


class LoginRequest(BaseModel):
    username: str = Field(..., description="Username (admin or driver1)")
    password: str = Field(..., description="Password")


class UserResponse(BaseModel):
    username: str
    role: str
    name: str
    driver_id: Optional[str] = None
    assigned_vehicle: Optional[str] = None


class LoginResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: UserResponse


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = int(time.time()) + ACCESS_TOKEN_EXPIRE_SECONDS
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception:
        return None


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Dict[str, Any]:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials missing or invalid."
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token."
        )

    username = payload.get("sub")
    if not username or username not in DEMO_USERS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not recognized in system."
        )

    user = DEMO_USERS[username].copy()
    user.pop("password", None)
    return user


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted: Administrator role required."
        )
    return user


async def require_driver(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted: Driver role required."
        )
    return user


@auth_router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    user_record = DEMO_USERS.get(req.username.strip().lower())
    if not user_record or user_record["password"] != req.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password. Use demo credentials."
        )

    token_data = {
        "sub": user_record["username"],
        "role": user_record["role"],
        "driver_id": user_record.get("driver_id"),
        "name": user_record["name"],
        "assigned_vehicle": user_record.get("assigned_vehicle"),
    }
    token = create_access_token(token_data)

    user_data = UserResponse(
        username=user_record["username"],
        role=user_record["role"],
        name=user_record["name"],
        driver_id=user_record.get("driver_id"),
        assigned_vehicle=user_record.get("assigned_vehicle"),
    )

    return LoginResponse(token=token, user=user_data)


@auth_router.get("/me", response_model=UserResponse)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return UserResponse(
        username=current_user["username"],
        role=current_user["role"],
        name=current_user["name"],
        driver_id=current_user.get("driver_id"),
        assigned_vehicle=current_user.get("assigned_vehicle"),
    )
