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


def test_receipt_states_move_from_device_to_uploading_to_server(tmp_path):  # B11
    import time
    photo = tmp_path / 'foam.jpg'
    Image.new('RGB', (200, 150), 'white').save(photo)
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        signed_in(p, fresh_contributor())
        fill_report(p, 'Foam below the footbridge', photo)
        expect(p.get_by_text('Saved on this device. Not submitted yet.')).to_be_visible()  # device-saved

        def slow(route):  # the real upload, held long enough to observe the uploading state
            time.sleep(1.5)
            route.continue_()
        p.route(re.compile(r'.*/api/v1/orgs/[^/]+/uploads$'), slow)
        p.get_by_role('button', name='Submit report').click()
        expect(p.get_by_text('Uploading photo 1 of 1…')).to_be_visible()
        expect(p.get_by_text(re.compile('received for review'))).to_have_count(0)  # uploading is not received
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+\?received=1'), timeout=30000)
        expect(p.get_by_text('Your report has been received for review. The cause is not established.')).to_be_visible()  # server-received
        expect(p.get_by_text(re.compile('1 photo attached'))).to_be_visible()
        browser.close()


def test_failed_upload_and_full_device_storage_stay_recoverable(tmp_path):  # H04
    photo = tmp_path / 'culvert.jpg'
    Image.new('RGB', (200, 150), 'grey').save(photo)
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        signed_in(p, fresh_contributor())
        fill_report(p, 'Grey water at the culvert', photo)
        uploads = re.compile(r'.*/api/v1/orgs/[^/]+/uploads$')
        p.route(uploads, lambda route: route.fulfill(status=503, content_type='application/json',
                body='{"error":{"code":"PROVIDER_UNAVAILABLE","message":"Evidence storage is unavailable.","retryable":true,"request_id":"x"}}'))
        p.get_by_role('button', name='Submit report').click()
        expect(p.get_by_text('A photo could not be uploaded. Retry, or remove it and submit without it. Nothing else was lost.')).to_be_visible()
        expect(p.get_by_text(re.compile('received for review'))).to_have_count(0)
        # the device refuses further writes (storage full): the page says so and keeps what is on screen
        p.evaluate("() => { IDBObjectStore.prototype.put = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; }")
        p.get_by_role('button', name='Back').click()
        p.get_by_label('Landmark or directions').fill('Grey water at the culvert, north bank')
        expect(p.get_by_text('This browser could not save the draft. Keep this tab open or copy your text.')).to_be_visible()
        expect(p.get_by_label('Landmark or directions')).to_have_value('Grey water at the culvert, north bank')
        p.unroute(uploads)
        p.reload()  # storage and upload service are back: the last saved draft, with its photo, is still on the device
        expect(p.get_by_text('Grey water at the culvert')).to_be_visible()
        p.get_by_role('button', name='Retry submission').click()
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'), timeout=30000)
        expect(p.get_by_text(re.compile('1 photo attached'))).to_be_visible()
        browser.close()


def test_service_worker_update_keeps_unsent_work():  # H10
    from pathlib import Path
    sw = Path(__file__).resolve().parents[2] / 'apps/web/public/sw.js'  # served from disk by `next start`
    original = sw.read_bytes()
    assert b'upstream-shell-v1' in original
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        try:
            signed_in(p, fresh_contributor())
            url = fill_report(p, 'Sheen under the rail bridge')
            p.wait_for_function('() => !!navigator.serviceWorker.controller', timeout=15000)
            sw.write_bytes(original.replace(b'upstream-shell-v1', b'upstream-shell-v2'))  # a new deployment
            p.reload()
            expect(p.get_by_text(re.compile('An update to Upstream is ready'))).to_be_visible(timeout=15000)
            expect(p.get_by_text('Sheen under the rail bridge')).to_be_visible()  # nothing reloaded away the unsent draft
            p.close()  # closing every tab lets the new version take over
            again = context.new_page()
            again.goto(url)
            again.wait_for_function("async () => (await caches.keys()).includes('upstream-shell-v2')", timeout=15000)
            expect(again.get_by_text('Sheen under the rail bridge')).to_be_visible()
            again.get_by_role('button', name='Submit report').click()
            expect(again).to_have_url(re.compile(r'/reports/[0-9a-f-]+'), timeout=30000)
        finally:
            sw.write_bytes(original)
            browser.close()


def test_offline_readings_keep_their_task_version_and_go_to_review():  # D12 H06
    from tests.api.test_field_work import accepted_task, transition
    from tests.api.test_http import ORG
    task = accepted_task()
    with sync_playwright() as pw:
        browser, context, p = start(pw)
        signed_in(p, 'monitor@example.test')
        p.goto(f"{BASE}/app/{ORG}/tasks/{task['id']}")
        expect(p.locator('#v0')).to_be_visible()
        context.set_offline(True)  # in the field without a connection
        p.locator('#v0').fill('461')
        p.locator('#t0').fill('13.9')
        p.get_by_role('button', name='Submit readings').click()
        expect(p.get_by_text(f"Saved on this device under task version {task['version']}.", exact=False)).to_be_visible()
        expect(p.get_by_text(re.compile('1 reading set saved on this device'))).to_be_visible()
        assert transition(task['id'], 'monitor', 'start', task['version']).status_code == 200  # the task changes on the server meanwhile
        context.set_offline(False)
        expect(p.get_by_text(re.compile('1 saved item was sent'))).to_be_visible(timeout=30000)
        p.reload()  # kept under the version it was captured with and sent to quality review, not silently merged
        expect(p.get_by_role('cell', name=re.compile(f"task revised after capture; submitted under task version {task['version']}"))).to_be_visible()
        expect(p.get_by_role('cell', name='Pending review')).to_be_visible()
        browser.close()
