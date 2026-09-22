"""Coordinator proposes and assigns, monitor accepts and records replicates, expert reviews - in a real browser."""
import random
import re
from datetime import datetime, timedelta

from playwright.sync_api import expect

from tests.e2e.test_report_flow import BASE, page, sign_in  # noqa: F401  (fixture reuse)


def pick(select, pattern):
    select.select_option(select.locator('option', has_text=re.compile(pattern)).first.get_attribute('value'))


def open_as(browser_page, email):
    browser_page.goto(BASE + '/sign-in')
    sign_in(browser_page, email)
    expect(browser_page).to_have_url(re.compile('/investigations'))


def test_task_proposal_assignment_capture_and_review(page):  # D01 D08 D14 (browser path)
    start = datetime.now() + timedelta(days=random.randint(2, 380), hours=random.randint(0, 23))
    open_as(page, 'coordinator@example.test')
    from tests.api.test_analysis import case_id
    from tests.api.test_http import ORG
    page.goto(f"{BASE}/app/{ORG}/investigations/{case_id('Harbour channel')}")
    page.get_by_role('link', name='Tasks', exact=True).click()
    page.get_by_label('Task type').select_option('conductance_reading')
    pick(page.get_by_label('Station'), '^B1 ')
    page.get_by_label('Protocol').select_option(index=1)
    page.get_by_label('Purpose').fill('Browser test: measure at B1 to help distinguish retained reaches.')
    page.get_by_label('Window start').fill(start.strftime('%Y-%m-%dT%H:%M'))
    page.get_by_label('Window end').fill((start + timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M'))
    page.get_by_role('button', name='Propose task').click()
    expect(page.get_by_text('Task proposed. It is not assigned')).to_be_visible()
    page.get_by_role('link', name='Open the proposed task').click()
    pick(page.get_by_label('Person'), 'Example trained monitor')
    pick(page.get_by_label('Verified instrument'), '^SC-009')
    page.get_by_role('button', name='Assign task').click()
    expect(page.locator('.page-intro')).to_contain_text('Assigned')
    task_url = page.url

    monitor = page.context.browser.new_context().new_page()
    open_as(monitor, 'monitor@example.test')
    monitor.goto(task_url)
    monitor.get_by_role('button', name='Accept').click()
    expect(monitor.get_by_text('Task accept recorded.')).to_be_visible()
    monitor.locator('#v0').fill('452')
    monitor.locator('#t0').fill('14.2')
    monitor.get_by_role('button', name='Add replicate').click()
    monitor.locator('#v1').fill('455')
    monitor.locator('#t1').fill('14.3')
    monitor.get_by_role('button', name='Submit readings').click()
    expect(monitor.get_by_text('Received, pending quality review.')).to_be_visible()
    expect(monitor.get_by_role('cell', name=re.compile('Pending review'))).to_have_count(2)

    expert = page.context.browser.new_context().new_page()
    open_as(expert, 'expert@example.test')
    expert.goto(task_url)
    expert.on('dialog', lambda d: d.accept('Replicates reviewed against the example protocol'))
    expert.get_by_role('button', name='Accept').first.click()
    expect(expert.get_by_role('cell', name='accepted')).to_have_count(1)
