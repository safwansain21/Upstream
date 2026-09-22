"""A07: every required data route shows loading, empty, error and permission states, and none is a dead end."""
import json
import re
import time
from uuid import uuid4

import httpx
import pytest
from playwright.sync_api import expect

from scripts.bootstrap_org import bootstrap
from services.api.config import settings
from tests.api.test_analysis import case_id
from tests.api.test_http import ORG
from tests.e2e.test_report_flow import BASE, page  # noqa: F401
from tests.e2e.test_routes import CASE_TABS, WORKSPACE
from tests.e2e.test_task_flow import open_as

FAILURE = json.dumps({'error': {'code': 'INTERNAL', 'message': 'The service could not answer (test).', 'retryable': True, 'request_id': 'test'}})


def way_out(p):
    """No dead end: the shared header still offers navigation back into the product."""
    expect(p.locator('header a[href]').first).to_be_visible()


def loading_then_error(page, pattern, paths):
    first = set()

    def fail(route):  # the first call is slow so the loading state is observable, then every call fails
        if route.request.url not in first:
            first.add(route.request.url)
            time.sleep(0.8)
        route.fulfill(status=500, content_type='application/json', body=FAILURE)
    page.route(pattern, fail)
    for path in paths:
        first.clear()
        page.goto(BASE + path)
        expect(page.locator('.loading-state').first).to_be_visible()
        expect(page.get_by_role('alert').filter(has_text='Unable to continue').first).to_be_visible(timeout=15000)
        expect(page.locator('#main-content h1').first).to_be_visible()
        way_out(page)
    page.unroute(pattern, fail)


@pytest.mark.parametrize('role', ['coordinator', 'admin'])
def test_every_workspace_route_shows_loading_then_error(page, role):  # A07 loading + error
    open_as(page, f'{role}@example.test')
    if role == 'admin':  # membership administration is only loaded for administrators
        loading_then_error(page, re.compile(r'.*/api/v1/orgs/.*'), [f'/app/{ORG}/settings/organization'])
        return
    mill = case_id('Mill Brook')
    loading_then_error(page, re.compile(r'.*/api/v1/orgs/.*'), [f'/app/{ORG}{w}' for w in WORKSPACE if w not in ('/settings/profile', '/settings/organization')]
                       + [f'/app/{ORG}/investigations/{mill}{t}' for t in CASE_TABS])
    # the profile page and the workspace shell read the account itself
    loading_then_error(page, re.compile(r'.*/api/v1/me$'), [f'/app/{ORG}/settings/profile'])
    expect(page.get_by_role('heading', name='Workspace')).to_be_visible()
    expect(page.get_by_role('button', name='Retry')).to_be_visible()


def test_review_routes_show_a_permission_state_to_contributors(page):  # A07 permission
    open_as(page, 'contributor@example.test')
    mill = case_id('Mill Brook')
    expected = {f'/app/{ORG}/evidence': 'Evidence review is for the review team',
                f'/app/{ORG}/investigations/{mill}/evidence': 'Evidence is not available to you',
                f'/app/{ORG}/investigations/{mill}/decision': 'Decisions are recorded by expert reviewers',
                f'/app/{ORG}/investigations/{mill}/exports': 'Evidence packages are for the review team',
                f'/app/{ORG}/settings/organization': 'Membership is managed by organization administrators',
                f'/app/{uuid4()}/investigations': 'This workspace is not available to you',
                f'/app/{ORG}/investigations/{uuid4()}': 'Investigation not found'}
    for path, heading in expected.items():
        page.goto(BASE + path)
        expect(page.get_by_role('heading', name=heading)).to_be_visible(timeout=15000)
        way_out(page)
    page.goto(f'{BASE}/app/{uuid4()}/investigations')
    page.get_by_role('link', name='Go to your workspace').click()  # the refusal offers a way back
    expect(page).to_have_url(re.compile(f'/app/{ORG}/'))


def test_new_organization_routes_show_empty_states(page):  # A07 empty
    cfg = settings()
    email, password = f'admin+{uuid4().hex[:8]}@org.example', f'unique-pass-{uuid4().hex[:8]}'
    r = httpx.post(cfg.supabase_url + '/auth/v1/admin/users', timeout=15, json={'email': email, 'password': password, 'email_confirm': True},
                   headers={'apikey': cfg.supabase_service_role_key, 'Authorization': f'Bearer {cfg.supabase_service_role_key}'})
    assert r.status_code == 200, r.text
    org = bootstrap('Empty Trust (test)', f'empty-{uuid4().hex[:6]}', email)['organization_id']
    page.goto(BASE + '/sign-in')
    page.get_by_label('Email', exact=True).fill(email)
    page.locator('#password').fill(password)
    page.get_by_role('button', name='Sign in', exact=True).click()
    expect(page).to_have_url(re.compile('/app/'))
    expected = {'/investigations': 'No investigations match', '/tasks': 'No tasks assigned to you', '/notifications': 'No notifications yet',
                '/settings/instruments': 'No instruments registered', '/settings/protocols': 'No protocols recorded',
                '/settings/integrations': 'No recipients configured', '/community': 'No approved assessments yet'}
    for path, heading in expected.items():
        page.goto(f'{BASE}/app/{org}{path}')
        expect(page.get_by_role('heading', name=heading)).to_be_visible(timeout=15000)
        way_out(page)


def test_public_data_routes_show_loading_error_and_unavailable_states(page):  # A07 public routes
    loading_then_error(page, re.compile(r'.*/api/v1/examples(/.*)?$'), ['/example', '/example/useful-evidence'])
    for path, heading in {'/example/no-such-scenario': 'This example is not available', f'/share/{uuid4().hex}': 'This link is no longer available'}.items():
        page.goto(BASE + path)
        expect(page.get_by_role('heading', name=heading)).to_be_visible(timeout=15000)
        way_out(page)
