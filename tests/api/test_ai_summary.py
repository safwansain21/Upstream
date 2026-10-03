"""AI case summary (PRD 9.2, Track 3): every sentence cites real records, numbers come from the records it cites, forbidden
claims and invented references reject the whole answer, and the template stands in. Through a local fake provider."""
import http.server
import json
import threading

import pytest

from services.api import ai_summary
from services.api.config import settings
from services.api.db import transaction
from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, as_, client

MODE = {'value': 'valid'}
SEEN = []


def reply(records_text):
    tags = [line.split(':')[0] for line in records_text.splitlines()[1:]]
    a = next(line for line in records_text.splitlines() if line.startswith('A1:'))
    retained = a.split(', ')[-1].split(' still')[0]  # e.g. "5.3 km"
    sentences = [{'text': f'The current assessment keeps {retained} still worth checking.', 'refs': ['A1']},
                 {'text': 'People reported a change and readings were taken.', 'refs': [t for t in tags if t[0] in 'RM'][:3]}]
    mode = MODE['value']
    if mode == 'invented':
        sentences[1]['refs'] = ['R99']
    elif mode == 'claim':
        sentences[1]['text'] = 'The foam was caused by the outfall upstream.'
    elif mode == 'number':
        sentences[0]['text'] = 'The current assessment keeps 9.9 km still worth checking.'
    elif mode == 'uncited':
        sentences[0]['refs'] = []
    return {'output_text': json.dumps({'schema_version': 'summary-v1', 'sentences': sentences, 'abstained': False})}


class Provider(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        text = body['input'][0]['content'][0]['text']
        SEEN.append(text)
        data = json.dumps(reply(text)).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a):
        pass


@pytest.fixture
def provider(monkeypatch):
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Provider)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    cfg = settings()
    for k, v in {'ai_provider': 'openai', 'ai_api_key': 'test-only-key', 'ai_model': 'fake-model',
                 'ai_base_url': f'http://127.0.0.1:{server.server_port}/v1'}.items():
        monkeypatch.setattr(cfg, k, v)
    MODE['value'] = 'valid'; SEEN.clear()
    yield
    server.shutdown()


def summary(role='coordinator', case='Mill Brook'):
    return client.post(f'/api/v1/orgs/{ORG}/cases/{case_id(case)}/ai/summary', headers=as_(role))


def test_summary_cites_only_real_records_and_sends_no_contributor_text(provider):
    r = summary()
    assert r.status_code == 200, r.text
    data = r.json()['data']
    assert data['source'] == 'ai' and data['model'] == 'fake-model'
    tags = {x['tag'] for x in data['records']}
    assert data['sentences'] and all(s['refs'] and set(s['refs']) <= tags for s in data['sentences'])
    assert {'A1'} <= tags and any(t.startswith('R') for t in tags)
    with transaction(worker=True) as db:
        descriptions = [d['description'] for d in db.execute(
            'select r.description from case_reports cr join reports r on r.id=cr.report_id where cr.case_id=%s', (case_id('Mill Brook'),)) if d['description']]
    assert descriptions and not any(d in SEEN[-1] for d in descriptions)  # free text never leaves for the provider
    with transaction(worker=True) as db:
        run = db.execute("select provider,purpose,output from ai_runs where purpose='summary' order by created_at desc limit 1").fetchone()
    assert run['provider'] == 'openai-responses' and run['output'] == data['sentences']


@pytest.mark.parametrize('mode', ['invented', 'claim', 'number', 'uncited'])
def test_an_unsupported_answer_falls_back_to_the_template_whole(provider, mode):
    MODE['value'] = mode
    data = summary().json()['data']
    assert data['source'] == 'template' and data['note'].startswith('The AI answer did not pass the checks')
    tags = {x['tag'] for x in data['records']}
    assert all(set(s['refs']) <= tags for s in data['sentences'])
    assert not any('caused' in s['text'] or '9.9' in s['text'] for s in data['sentences'])


def test_without_a_provider_the_template_is_labelled(monkeypatch):
    monkeypatch.setattr(settings(), 'ai_api_key', '')
    data = summary().json()['data']
    assert data['source'] == 'template' and data['note'] == 'AI assistance is unavailable; this summary uses a fixed template.'
    assert data['sentences'] and all(s['refs'] for s in data['sentences'])


def test_summary_is_read_as_the_caller():  # RLS: a member of another organization learns nothing
    r = client.post(f'/api/v1/orgs/{ORG}/cases/{case_id("Mill Brook")}/ai/summary', headers=as_('reporter'))  # a fresh user with no membership
    assert r.status_code in (403, 404)


def test_checks_reject_numbers_and_claims_not_in_cited_records():
    recs = [{'tag': 'A1', 'kind': 'assessment', 'id': 'a', 'text': 'Assessment revision 2: 1.2 km ruled out under the stated assumptions, 5.3 km still worth checking.'}]
    ok = ai_summary.Summary(schema_version='summary-v1', abstained=False, sentences=[ai_summary.Sentence(text='Revision 2 keeps 5.3 km worth checking.', refs=['A1'])])
    assert ai_summary.check(ok, recs)
    for text in ('Revision 2 keeps 6.1 km worth checking.', 'The stream is safe below the bridge in revision 2.', 'Runoff from the farm is the cause.'):
        with pytest.raises(ValueError):
            ai_summary.check(ai_summary.Summary(schema_version='summary-v1', abstained=False, sentences=[ai_summary.Sentence(text=text, refs=['A1'])]), recs)
