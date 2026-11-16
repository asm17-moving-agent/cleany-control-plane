#!/usr/bin/env python3
"""Exercise seat persistence on an isolated localhost-forwarded review database."""
import argparse
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import httpx

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('url')
parser.add_argument('site')
parser.add_argument('output', type=Path)
args = parser.parse_args()
url = urlsplit(args.url)
if url.hostname != '127.0.0.1' or url.port != 18082:
    raise ValueError('This mutating fixture check is restricted to the isolated review forward :18082')
with httpx.Client(base_url=args.url, timeout=15, headers={'Origin': args.url}) as client:
    login = client.post('/api/auth/login', json={'login_id': os.environ['CLEANY_REVIEW_LOGIN'],
                                               'password': os.environ['CLEANY_REVIEW_PASSWORD']})
    login.raise_for_status()
    client.headers['X-CSRF-Token'] = login.json()['csrf_token']
    client.params = {'site_id': args.site}
    original = client.get('/api/seat-layout').json()['layout']
    assert len(original['seats']) == 82
    updated = copy.deepcopy(original)
    updated['seats'][0]['pose']['x'] += 0.1
    updated['seats'][0]['approach']['x'] += 0.1
    saved = client.put('/api/seat-layout', json=updated)
    saved.raise_for_status()
    try:
        actual = client.get('/api/seat-layout').json()['layout']
        assert actual == saved.json()['layout']
        assert actual['revision'] == original['revision']+1
        stale = client.put('/api/seat-layout', json=original)
        assert stale.status_code == 409
        assert client.get('/api/seat-layout', params={'site_id': 'foreign'}).status_code == 404
        client.headers.pop('X-CSRF-Token')
        assert client.put('/api/seat-layout', json=actual).status_code == 403
        client.headers['X-CSRF-Token'] = login.json()['csrf_token']
        targets = client.get('/api/seat-layout/targets').json()
        assert targets['validation_status'] == 'draft'
        assert not any(s['mission_supported'] for s in client.get('/api/seats').json()['items'])
        for seat_id in ['seat-01', 'seat-a1-01', 'seat-m1-01']:
            seat = next(s for s in actual['seats'] if s['seat_id'] == seat_id)
            assert targets['seats'][seat_id] == [seat['approach'][k] for k in ('x', 'y', 'yaw')]
    finally:
        restore = copy.deepcopy(original)
        restore['revision'] = saved.json()['layout']['revision']
        restored = client.put('/api/seat-layout', json=restore)
        restored.raise_for_status()
    result = dict(site=args.site, seats=82, stored_revision=actual['revision'],
                  restored_revision=restored.json()['layout']['revision'], stale_write_status=409,
                  foreign_site_status=404, csrf_status=403, representative_targets=3,
                  target_status='draft', physical_motion=False)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result))
