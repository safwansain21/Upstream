"""Viewport reflow (I05), keyboard-only reporting (I06) and reduced motion (I09) in a real browser."""
import re

import pytest
from playwright.sync_api import expect, sync_playwright

from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, fresh_contributor
from tests.e2e.test_report_flow import BASE, sign_in

WIDTHS = [1920, 1440, 1280, 1024, 768, 390, 320]


def overflow(p):
    return p.evaluate('document.documentElement.scrollWidth - window.innerWidth')


@pytest.mark.parametrize('width', WIDTHS)
def test_pages_reflow_without_horizontal_scroll(width):  # I05
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        p = browser.new_context(viewport={'width': width, 'height': 900}).new_page()
        offenders = {}
        for path in ['/', '/how-it-works', '/example', '/example/useful-evidence', '/sign-in', '/report/new']:
            p.goto(BASE + path)
            expect(p.locator('#main-content h1').first).to_be_visible(timeout=15000)
            if (o := overflow(p)) > 1:
                offenders[path] = o
        p.goto(BASE + '/sign-in')
        sign_in(p, 'expert@example.test')
        expect(p).to_have_url(re.compile('/investigations'))
        mill = case_id('Mill Brook')
        for path in [f'/app/{ORG}/investigations', f'/app/{ORG}/investigations/{mill}', f'/app/{ORG}/investigations/{mill}/evidence',
                     f'/app/{ORG}/investigations/{mill}/observations', f'/app/{ORG}/tasks', f'/app/{ORG}/settings/organization']:
            p.goto(BASE + path)
            expect(p.locator('#main-content h1').first).to_be_visible(timeout=15000)
            p.wait_for_load_state('networkidle')
            if (o := overflow(p)) > 1:
                offenders[path] = o
        browser.close()
    assert not offenders, offenders


def test_keyboard_only_report(tmp_path):  # I06 (reporting path)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        p = browser.new_context(viewport={'width': 1280, 'height': 900}).new_page()
        p.goto(BASE + '/sign-in')
        sign_in(p, fresh_contributor())
        expect(p).to_have_url(re.compile('/investigations|/onboarding'))  # a new account without membership lands on onboarding
        p.goto(BASE + '/report/new')
        expect(p.get_by_role('button', name='Continue to location')).to_be_visible()

        def tab_to(locator, limit=80):
            for _ in range(limit):
                p.keyboard.press('Tab')
                if locator.evaluate('el => el === document.activeElement'):
                    return
            raise AssertionError(f'could not reach {locator} by keyboard')

        tab_to(p.get_by_label('Unusual foam'))
        p.keyboard.press('Space')
        tab_to(p.get_by_role('button', name='Continue to location'))
        p.keyboard.press('Enter')
        expect(p.get_by_role('heading', name='Where was it?')).to_be_focused()  # focus moves to the new step heading
        tab_to(p.get_by_label('Landmark or directions'))
        p.keyboard.type('Keyboard bridge, Mill Lane')
        tab_to(p.get_by_role('button', name='Continue to review'))
        p.keyboard.press('Enter')
        tab_to(p.get_by_role('button', name='Submit report'))
        p.keyboard.press('Enter')
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'))
        expect(p.get_by_text('The cause is not established')).to_be_visible()
        browser.close()


def test_reduced_motion_is_honoured():  # I09 (OS setting and application setting)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        p = browser.new_context(reduced_motion='reduce').new_page()
        p.goto(BASE + '/')
        expect(p.locator('html')).to_have_attribute('data-motion', 'reduced')
        moving = p.evaluate('document.getAnimations().filter(a => a.playState === "running" && isFinite(a.effect.getComputedTiming().endTime) && a.effect.getComputedTiming().duration > 80).length')
        assert moving == 0
        q = browser.new_context(reduced_motion='no-preference').new_page()
        q.goto(BASE + '/sign-in')
        sign_in(q, 'expert@example.test')
        expect(q).to_have_url(re.compile('/investigations'))
        q.goto(f'{BASE}/app/{ORG}/settings/profile')
        q.get_by_label('Reduce motion').check()
        expect(q.locator('html')).to_have_attribute('data-motion', 'reduced')
        q.reload()
        expect(q.locator('html')).to_have_attribute('data-motion', 'reduced')  # the application setting persists
        browser.close()
