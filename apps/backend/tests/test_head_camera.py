import httpx
import pytest
from fastapi.testclient import TestClient
from account_support import authorize
from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings


@pytest.fixture
def camera():
    app = ControlPlaneApplication(start_dispatcher=False, settings=Settings(
        database_path=':memory:', cookie_secure=False, camera_preview_url='http://127.0.0.1:8769',
        head_camera_topic='/camera/head/color/image_raw'))
    requests = []
    reply = dict(status_code=200, content=b'\xff\xd8test\xff\xd9', headers={'Content-Type': 'image/jpeg', 'X-Frame-Age': '.1'})
    def transport(request):
        requests.append(request)
        return httpx.Response(**reply)
    app.head_camera.transport = httpx.MockTransport(transport)
    with TestClient(create_app(app)) as client:
        yield client, app, requests, reply


def test_scoped_fresh_jpeg_and_fixed_topic(camera):
    client, app, requests, _ = camera
    url = '/api/robots/cleany-01/camera/head'
    assert client.get(url).status_code == 401
    authorize(client, app)
    assert client.get(url, params={'site_id':'BUSAN_SOMA_19F'}).status_code == 404
    response = client.get(url, params={'site_id':'BUSAN_SOMA_18F', 'topic':'/unapproved'})
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    assert response.content == b'\xff\xd8test\xff\xd9'
    assert len(requests) == 1
    assert requests[0].url.params['topic'] == '/camera/head/color/image_raw'


@pytest.mark.parametrize('change', [
    {'status_code':202}, {'status_code':500}, {'content':b'bad'},
    {'headers':{'Content-Type':'image/jpeg','X-Frame-Age':'3'}},
    {'headers':{'Content-Type':'image/jpeg','X-Frame-Age':'nan'}},
    {'headers':{'Content-Type':'text/html','X-Frame-Age':'.1'}},
    {'content':b'\xff\xd8'+b'x'*(2*1024*1024)+b'\xff\xd9'},
])
def test_missing_stale_or_invalid_images_not_forwarded(camera, change):
    client, app, _, reply = camera
    authorize(client, app)
    reply.update(change)
    assert client.get('/api/robots/cleany-01/camera/head?site_id=BUSAN_SOMA_18F').status_code == 503


def test_mock_never_opens_live_camera(camera):
    client, app, requests, _ = camera
    authorize(client, app)
    app.settings.robot_mode = 'mock'
    assert client.get('/api/robots/cleany-01/camera/head?site_id=BUSAN_SOMA_18F').status_code == 503
    assert not requests


def test_monitor_origin_rejects_remote_or_paths():
    for origin in ('https://example.com', 'http://127.0.0.1/api', 'http://user:pw@localhost'):
        with pytest.raises(ValueError):
            Settings(camera_preview_url=origin)
