from control_plane.server import ControlPlaneApplication

PASSWORD = "test-user-password-2026"


def prepare(application: ControlPlaneApplication):
    accounts = application.accounts
    customer = accounts.create_customer("Test customer")
    site = accounts.create_site(customer, "부산 소마 센터 18층", site_id="BUSAN_SOMA_18F")
    accounts.create_site(customer, "부산 소마 센터 19층", "unconnected", "BUSAN_SOMA_19F")
    user, temporary = accounts.provision(customer, "test-operator", "운영자")
    token = accounts.login("test-operator", temporary, "setup")
    token = accounts.change_password(token, PASSWORD)
    identity = accounts.authenticate(token)
    robot_token = accounts.register_robot(customer, site)
    return user, token, identity.csrf_token, robot_token


def authorize(client, application):
    user, token, csrf, robot = prepare(application)
    client.cookies.set("cleany_session", token)
    client.headers.update(
        {"Origin": "http://test", "X-CSRF-Token": csrf, "X-Cleany-Robot-Token": robot}
    )
    return user
