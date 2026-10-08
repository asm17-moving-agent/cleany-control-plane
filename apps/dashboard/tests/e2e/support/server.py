"""Isolated E2E server with explicitly provisioned fixture accounts."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[5] / "apps/backend"))

import uvicorn
from control_plane.accounts import token_hash, HASHER
from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings

settings = Settings(cookie_secure=False)
application = ControlPlaneApplication(settings=settings)
accounts = application.accounts
customer = accounts.create_customer("E2E customer")
site = accounts.create_site(customer, "부산 소마 센터 18층", site_id="BUSAN_SOMA_18F")
accounts.create_site(customer, "부산 소마 센터 19층", "unconnected", "BUSAN_SOMA_19F")
user, password = accounts.provision(customer, "e2e-operator", "운영자")
token = accounts.login("e2e-operator", password, "setup")
accounts.change_password(token, "e2e-operator-password-2026")
first_user, _ = accounts.provision(customer, "e2e-first", "처음 사용자")
accounts.register_robot(customer, site)
with application.store.transaction():
    accounts.db.execute("UPDATE users SET password_hash=? WHERE user_id=?",
                        (HASHER.hash("e2e-first-temporary-password"), first_user))
    accounts.db.execute("UPDATE robots SET token_hash=? WHERE robot_id='cleany-01'",
                        (token_hash("e2e-robot-token-only-for-tests"),))
uvicorn.run(create_app(application), host="127.0.0.1", port=settings.port)
