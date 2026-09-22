"""Offline drafts and foreground sync in a real browser (H01, H02, H03, H05, H09, H12)."""
import re

from PIL import Image
from playwright.sync_api import expect, sync_playwright

from tests.api.test_http import fresh_contributor
from tests.e2e.test_report_flow import BASE, sign_in


def start(pw):
    browser = pw.chromium.launch()
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    return browser, context, context.new_page()


def signed_in(p, email):
    p.goto(BASE + '/sign-in')
    sign_in(p, email)
    expect(p).to_have_url(re.compile('/investigations|/onboarding'))


def fill_report(p, landmark, photo=None):
    p.goto(BASE + '/report/new')
    expect(p).to_have_url(re.compile(r'/report/[0-9a-f-]+/edit'))
    p.get_by_label('Visible discharge').check()
    if photo:
        p.get_by_label('Photos (optional, up to 5)').set_input_files(str(photo))
    p.get_by_role('button', name='Continue to location').click()
    p.get_by_label('Landmark or directions').fill(landmark)
    p.get_by_role('button', name='Continue to review').click()
    return p.url


def test_draft_survives_closing_the_tab():  # H01
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        signed_in(p, fresh_contributor())
        url = fill_report(p, 'Outfall by the old tannery')
        p.wait_for_timeout(300)  # device writes are asynchronous; a real tab close after this keeps everything
        p.close()
        again = context.new_page()
        again.goto(url)
        expect(again.get_by_text('Outfall by the old tannery').or_(again.get_by_label('Landmark or directions'))).to_be_visible()
        restored = again.evaluate('() => document.body.innerText.includes("Outfall by the old tannery") || [...document.querySelectorAll("input")].some(i => i.value === "Outfall by the old tannery")')
        assert restored
        browser.close()


def test_offline_submission_is_queued_then_sent_once_with_photo(tmp_path):  # H02 H05 H12
    photo = tmp_path / 'outfall.jpg'
    Image.new('RGB', (200, 150), 'brown').save(photo)
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        signed_in(p, fresh_contributor())
        fill_report(p, 'Pipe below the retail park', photo)
        context.set_offline(True)
        p.get_by_role('button', name='Submit report').click()
        expect(p.get_by_text(re.compile('It will be sent when you are back online')).first).to_be_visible(timeout=15000)
        expect(p.get_by_text(re.compile('You are offline'))).to_be_visible()
        expect(p.get_by_text(re.compile('Approving, assigning, publishing maps and sending packages need a connection'))).to_be_visible()
        expect(p.get_by_text('received for review')).to_have_count(0)  # no success before the server accepts it
        expect(p.get_by_role('button', name='Retry submission')).to_be_visible()
        context.set_offline(False)  # reconnect: the queue sends photos first, then the report
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'), timeout=30000)
        expect(p.get_by_text('The cause is not established')).to_be_visible()
        expect(p.get_by_text(re.compile('1 photo attached'))).to_be_visible()
        browser.close()


def queued_status(p, url):
    draft_id = url.rstrip('/').split('/')[-2]
    return p.evaluate("""id => new Promise(done => { const r = indexedDB.open('upstream'); r.onsuccess = () => {
        const g = r.result.transaction('drafts').objectStore('drafts').get(id); g.onsuccess = () => done(g.result && g.result.status); }; })""", draft_id)


def test_account_switch_never_sends_another_users_draft():  # H03
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        signed_in(p, fresh_contributor.__wrapped__())
        url = fill_report(p, 'Draft that belongs to the first account')
        context.set_offline(True)
        p.get_by_role('button', name='Submit report').click()
        expect(p.get_by_text(re.compile('It will be sent when you are back online')).first).to_be_visible(timeout=15000)
        context.clear_cookies()  # the first person signs out (the session lives in cookies) while still offline
        p.goto(BASE + '/sign-in')  # still offline: the app shell is served from the service worker cache
        expect(p.get_by_role('heading', name='Sign in')).to_be_visible()
        context.set_offline(False)
        signed_in(p, fresh_contributor.__wrapped__())  # a different person on the same device
        p.goto(url)
        expect(p.get_by_text('This draft is not on this device for the current account')).to_be_visible()
        assert queued_status(p, url) == 'queued'  # still unsent, still owned by the first account
        browser.close()


def test_expired_session_keeps_the_form_and_resumes_after_sign_in():  # H09
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        email = fresh_contributor()
        signed_in(p, email)
        url = fill_report(p, 'Foam at the weir steps')
        expired = {'n': 0}

        def once(route):  # the server rejects the expired session exactly once
            if expired['n'] == 0 and route.request.method == 'POST':
                expired['n'] += 1
                return route.fulfill(status=401, content_type='application/json',
                                     body='{"error":{"code":"AUTH_REQUIRED","message":"Your session expired. Sign in again; your draft is preserved.","retryable":false,"request_id":"x"}}')
            return route.continue_()
        p.route(re.compile(r'.*/api/v1/orgs/[^/]+/reports$'), once)
        p.get_by_role('button', name='Submit report').click()
        expect(p).to_have_url(re.compile('/sign-in'))
        sign_in(p, email)
        expect(p).to_have_url(url)
        expect(p.get_by_text('Foam at the weir steps')).to_be_visible()
        p.get_by_role('button', name=re.compile('Submit report|Retry submission')).click()
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'))
        browser.close()


def test_send_interrupted_by_closing_the_tab_is_retried():  # H02 (recovery path)
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        signed_in(p, fresh_contributor())
        url = fill_report(p, 'Oil sheen at the slipway')
        draft_id = url.rstrip('/').split('/')[-2]
        p.evaluate("""id => new Promise(done => { const r = indexedDB.open('upstream'); r.onsuccess = () => {
            const store = r.result.transaction('drafts', 'readwrite').objectStore('drafts'); const g = store.get(id);
            g.onsuccess = () => { const d = g.result; d.status = 'submitting'; d.updatedAt = 0; store.put(d).onsuccess = () => done(true); }; }; })""", draft_id)
        p.reload()  # a send that was cut off long ago is picked up again with the same idempotency key
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'), timeout=30000)
        expect(p.get_by_text('The cause is not established')).to_be_visible()
        browser.close()
