"""Browser workflows against the running stack: API on :8000, `next start` on :3000, seeded example workspace.

Start with: pnpm --filter @upstream/web build && (uvicorn services.api.main:app --port 8000 & pnpm --filter @upstream/web start -p 3000)
"""
import os
import re

import pytest
from playwright.sync_api import expect, sync_playwright

BASE = os.getenv('E2E_BASE_URL', 'http://127.0.0.1:3000')


@pytest.fixture
def page():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        yield context.new_page()
        browser.close()


def sign_in(page, email):
    page.get_by_label('Email', exact=True).fill(email)
    page.locator('#password').fill('upstream-example-only')
    page.get_by_role('button', name='Sign in', exact=True).click()


def test_guest_landmark_report_survives_sign_in_and_opens_one_case(page):  # B01 B02 B03 B11
    page.goto(BASE + '/report/new')
    expect(page).to_have_url(re.compile(r'/report/[0-9a-f-]+/edit'))
    draft_url = page.url
    page.get_by_role('button', name='Continue to location').click()
    expect(page.locator('.inline-error')).to_contain_text('Choose what you noticed')  # error summary, nothing lost
    page.get_by_label('Change in colour').check()
    page.get_by_label('Describe your observation').fill('Grey water under the old railway arch.')
    page.get_by_role('button', name='Continue to location').click()
    page.get_by_label('Landmark or directions').fill('Old railway arch, Station Road')
    page.get_by_label('This stream is not on the map').check()
    page.get_by_role('button', name='Continue to review').click()
    expect(page.get_by_text('location verification needed')).to_be_visible()
    page.get_by_role('button', name='Submit report').click()
    expect(page).to_have_url(re.compile('/sign-in'))
    sign_in(page, 'contributor@example.test')
    expect(page).to_have_url(draft_url)
    expect(page.get_by_text('Old railway arch, Station Road')).to_be_visible()  # guest draft preserved after sign-in
    page.get_by_role('button', name='Submit report').click()
    expect(page).to_have_url(re.compile(r'/app/[0-9a-f-]+/reports/[0-9a-f-]+'))
    expect(page.get_by_text('The cause is not established')).to_be_visible()
    expect(page.get_by_text('Location to be confirmed')).to_be_visible()
    page.get_by_role('link', name='Unnamed stream').click()
    expect(page.get_by_text('Investigation area not yet established')).to_be_visible()


def test_directory_requires_sign_in_and_lists_example_cases(page):  # A03 G01
    page.goto(BASE + '/app')
    expect(page).to_have_url(re.compile('/sign-in'))
    sign_in(page, 'coordinator@example.test')
    expect(page).to_have_url(re.compile('/investigations'))
    expect(page.get_by_role('heading', name='Mill Brook')).to_be_visible()
    page.reload()  # direct load/refresh retains server records and org identity
    expect(page.get_by_role('heading', name='Mill Brook')).to_be_visible()
    page.goto(BASE + '/app/00000000-0000-4000-8000-000000000000/investigations')
    expect(page.get_by_text('This workspace is not available to you')).to_be_visible()
