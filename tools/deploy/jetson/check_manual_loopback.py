"""Exercise the isolated mock HTTP relay on Jetson without SSH round-trip delays."""
import json
import time
import uuid
from pathlib import Path

import httpx

base = 'http://127.0.0.1:18083'
with httpx.Client(base_url=base, timeout=2, trust_env=False) as client:
    response = client.post('/api/auth/login', headers={'Origin': base}, json={
        'login_id': 'e2e-operator', 'password': 'e2e-operator-password-2026'})
    response.raise_for_status()
    client.headers.update({'Origin': base, 'X-CSRF-Token': response.json()['csrf_token']})
    endpoint = '/api/robots/cleany-01/manual/'
    scope = '?site_id=BUSAN_SOMA_18F'

    def state():
        response = client.get(endpoint+'status'+scope)
        response.raise_for_status()
        return response.json()

    initial = state()
    assert initial['mock'] is True, 'Refuse real hardware exercise'
    assert initial['ready'] is True
    identifier = uuid.uuid4().hex

    def send(sequence, action):
        return client.post(endpoint+'control'+scope, json={
            'client': identifier, 'sequence': sequence, 'action': action,
            'vector': [.37, -.23, .41 if sequence < 9 else -.41], 'speed': .5})

    def stopped():
        deadline = time.monotonic()+2
        while time.monotonic() < deadline:
            current = state()
            if current['phase']=='idle' and current['stop_confirmed'] and not current['enabled']:
                return current
            time.sleep(.02)
        raise AssertionError('Mock controller did not confirm stop')

    assert send(1, 'press').status_code == 200
    latencies = []
    try:
        for sequence in range(2, 16):
            started = time.monotonic()
            assert send(sequence, 'update').status_code == 200
            latencies.append((time.monotonic()-started)*1000)
            time.sleep(max(0, .07-(time.monotonic()-started)))
        assert state()['phase']=='moving'
    finally:
        assert send(16, 'stop').status_code == 200
    stopped()
    assert send(15, 'press').status_code == 409
    assert state()['phase']=='idle'
    assert send(17, 'press').status_code == 200
    # Deliberately lose input; preserve the existing 250 ms lease unchanged.
    time.sleep(.4)
    final = stopped()
    result = dict(phone_mock=True, physical_motion=False, hold_release=True,
                  lease_expiry=True, stale_press_rejected=True, analog_vector=True,
                  update_round_trip_ms_max=round(max(latencies), 2), final=final)
    (Path.home()/'.cache/cleany-manual-review/validation.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
