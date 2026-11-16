"""Serve a staged dashboard against the explicitly configured isolated review DB."""
import sys
from pathlib import Path
import uvicorn
from control_plane.server import create_app
from control_plane.settings import Settings

settings=Settings()
uvicorn.run(create_app(dashboard_root=Path(sys.argv[1])),host='127.0.0.1',port=settings.port,
            timeout_graceful_shutdown=settings.shutdown_grace_seconds)
