"""When the AI provider's usage limit is reached (HTTP 429), AI help pauses openly: the report form's assistant says so instead
of failing vaguely, case summaries use the fixed template with a note saying why, no further calls go out until the limit
lifts, and the first success clears the pause. Reporting never depends on it. Through a local fake provider."""
import http.server
import json
import threading

import pytest

from services.api import ai
from services.api.config import settings
from tests.api.test_ai_summary import summary
from tests.api.test_http import ORG, client, fresh_contributor, token

HITS = []
STATE = {'limited': True}


class Provider(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers['Content-Length']))
        HITS.append(self.path)
        if STATE['limited']:  # Gemini's quota answer, with the delay it asks for
            data = json.dumps({'error': {'code': 429, 'status': 'RESOURCE_EXHAUSTED',
                                         'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '120s'}]}}).encode()
            self.send_response(429)
        else:
            data = json.dumps({'output_text': json.dumps({'schema_version': 'describe-v1', 'model_id': 'fake', 'observation_candidates': [],
                                                          'suggested_questions': [], 'abstained': True})}).encode()
            self.send_response(200)
        self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a):
        pass


@pytest.fixture
def limited(monkeypatch):
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Provider)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    cfg = settings()
    for k, v in {'ai_provider': 'openai', 'ai_api_key': 'test-only-key', 'ai_model': 'fake-model',
                 'ai_base_url': f'http://127.0.0.1:{server.server_port}/v1'}.items():
        monkeypatch.setattr(cfg, k, v)
    HITS.clear(); STATE['limited'] = True; ai.note_success()
    yield
    ai.note_success()
    server.shutdown()


def test_usage_limit_pauses_ai_help_openly_and_stops_calling(limited):
    user = token(fresh_contributor.__wrapped__())   # own user: the shared reporter would reach the 10 per hour AI limit
    assert client.get('/api/v1/ai/status').json()['data'] == {'configured': True, 'paused': False}
    r = client.post(f'/api/v1/orgs/{ORG}/ai/describe', headers=user, json={'text': 'Foam near the footbridge'})
    assert r.status_code == 503 and r.json()['error']['code'] == 'PROVIDER_UNAVAILABLE'
    assert r.json()['error']['message'] == ai.PAUSED
    assert client.get('/api/v1/ai/status').json()['data']['paused'] is True
    calls = len(HITS)
    again = client.post(f'/api/v1/orgs/{ORG}/ai/describe', headers=user, json={'text': 'Foam near the footbridge'})
    assert again.status_code == 503 and again.json()['error']['message'] == ai.PAUSED
    data = summary().json()['data']   # the summary still works, from the template, and says why
    assert data['source'] == 'template' and data['note'].startswith('AI summaries are paused for now')
    assert data['sentences'] and all(s['refs'] for s in data['sentences'])
    assert len(HITS) == calls          # while paused, nothing more is sent to the provider


def test_the_first_success_clears_the_pause(limited):
    user = token(fresh_contributor.__wrapped__())
    client.post(f'/api/v1/orgs/{ORG}/ai/describe', headers=user, json={'text': 'Foam near the footbridge'})
    assert ai.paused()
    ai._paused_until = 0.0   # the provider's delay has passed
    STATE['limited'] = False
    calls = len(HITS)
    r = client.post(f'/api/v1/orgs/{ORG}/ai/describe', headers=user, json={'text': 'Foam near the footbridge'})
    assert len(HITS) == calls + 1                           # the provider is asked again once the delay has passed
    assert r.status_code == 200 or r.json()['error']['message'] != ai.PAUSED
    assert client.get('/api/v1/ai/status').json()['data']['paused'] is False   # its answer lifted the pause
