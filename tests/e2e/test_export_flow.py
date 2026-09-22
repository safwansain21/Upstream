"""Expert creates a package, verifies it and sends it; the recipient opens the scoped link and acknowledges (browser)."""
import re

from playwright.sync_api import expect

from tests.api.test_exports import approved_case, recipient
from tests.api.test_http import ORG
from tests.e2e.test_report_flow import BASE, page  # noqa: F401
from tests.e2e.test_task_flow import open_as, pick


def test_package_send_and_recipient_acknowledgment(page):  # F07 F12 F15 F16 J08 (browser path)
    case, a = approved_case()
    rid = recipient()
    open_as(page, 'expert@example.test')
    page.goto(f'{BASE}/app/{ORG}/investigations/{case}/exports')
    page.get_by_role('button', name=re.compile('Create package for assessment')).click()
    expect(page.get_by_role('heading', name=re.compile(r'Assessment \d+ package'))).to_be_visible(timeout=60000)
    expect(page.get_by_text('Not sent to anyone.')).to_be_visible()
    page.get_by_role('button', name='Verify integrity').click()
    expect(page.get_by_text(re.compile('Integrity verified · signature (verified|unsigned)'))).to_be_visible()
    with page.expect_download() as dl:
        page.get_by_role('button', name='Download report.pdf').click()
    assert dl.value.suggested_filename == 'report.pdf'
    pick(page.get_by_label('Recipient'), 'Example recipient')
    page.get_by_label(re.compile('I am explicitly sending this package')).check()
    page.get_by_role('button', name='Send package').click()
    link = page.locator('.notice .mono').inner_text()
    assert '/share/' in link
    expect(page.get_by_role('cell', name='Not acknowledged')).to_be_visible()

    recipient_page = page.context.browser.new_context().new_page()  # no Upstream account
    recipient_page.goto(link)
    expect(recipient_page.get_by_text('Current package')).to_be_visible()
    expect(recipient_page.get_by_text(re.compile('km of channel retained'))).to_be_visible()
    expect(recipient_page.get_by_role('link', name='report.pdf')).to_be_visible()
    recipient_page.get_by_label('Your name or role').fill('Example duty officer')
    recipient_page.get_by_role('button', name='Acknowledge').click()
    expect(recipient_page.get_by_text(re.compile('Acknowledged by Example duty officer'))).to_be_visible()

    page.reload()
    expect(page.get_by_role('cell', name=re.compile('Example duty officer'))).to_be_visible()
    recipient_page.goto(f'{BASE}/share/not-a-real-token')
    expect(recipient_page.get_by_text('This link is no longer available')).to_be_visible()
