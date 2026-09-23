import json
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import engine


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        fields = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in (
            "request_id",
            "organization_id",
            "incident_id",
            "pipeline_id",
            "agent_run_id",
            "method",
            "path",
            "status",
            "duration_ms",
        ):
            value = getattr(record, key, None)
            if value is not None:
                fields[key] = str(value) if key.endswith("_id") else value
        return json.dumps(fields)


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=settings.log_level.upper(), handlers=[handler], force=True)
logger = logging.getLogger("dataops.api")

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
app.include_router(api_router)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request completed",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - start) * 1000, 2),
            "request_id": request_id,
        },
    )
    return response


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", tags=["system"])
def ready() -> JSONResponse:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("readiness check failed")
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return JSONResponse(content={"status": "ready"})
