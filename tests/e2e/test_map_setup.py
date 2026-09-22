"""Coordinator imports linework for an unmapped case, places a station, verifies a reach and publishes (browser)."""
import json
import re

from playwright.sync_api import expect

from tests.api.test_mapping import CROSSING, LAT, LON, Y, fresh_case
from tests.api.test_http import ORG
from tests.e2e.test_report_flow import BASE, page  # noqa: F401
from tests.e2e.test_task_flow import open_as


def test_import_station_verify_and_publish(page, tmp_path):  # C01 C04 C06 C07 (browser path)
    case = fresh_case()['case_id']
    geo = tmp_path / 'trace.geojson'
    geo.write_text(json.dumps({'type': 'FeatureCollection', 'features': Y + [CROSSING]}))
    open_as(page, 'coordinator@example.test')
    page.goto(f'{BASE}/app/{ORG}/investigations/{case}/map-setup')
    expect(page.get_by_text('No local network yet')).to_be_visible()
    page.get_by_label(re.compile('Import GeoJSON linework')).set_input_files(str(geo))
    page.get_by_label('Source').fill('Example community trace (synthetic)')
    page.get_by_label('Licence').fill('CC-BY-4.0')
    page.get_by_role('button', name='Import as draft').click()
    expect(page.get_by_role('heading', name='Draft version 1')).to_be_visible()
    expect(page.get_by_text(re.compile('cross without a shared junction'))).to_be_visible()
    expect(page.get_by_text('mapping_incomplete: connectivity or direction unknown')).to_be_visible()
    page.get_by_label('Station code').fill('S1')
    page.get_by_label('Latitude').fill(str(LAT + .0025))
    page.get_by_label('Longitude').fill(str(LON))
    page.get_by_role('button', name='Place station').click()
    expect(page.get_by_role('cell', name='C:up')).to_be_visible()
    page.get_by_label('Station code').fill('FAR')
    page.get_by_label('Latitude').fill(str(LAT + .01))
    page.get_by_label('Longitude').fill(str(LON + .01))
    page.get_by_role('button', name='Place station').click()
    expect(page.get_by_text(re.compile('not moved automatically'))).to_be_visible()
    page.get_by_role('button', name='Direction verified').first.click()
    expect(page.get_by_role('cell', name='verified').first).to_be_visible()
    page.get_by_label('Verification rationale').fill('Walked the reaches with the local group')
    page.get_by_label(re.compile('Evidence references')).fill('field-walk-2026-09')
    page.get_by_label('Upstream boundary').select_option('open')
    page.get_by_role('button', name='Publish version').click()
    expect(page.get_by_text('Published. Earlier assessments keep the version they used.')).to_be_visible()
    expect(page.get_by_role('heading', name='Published version 1')).to_be_visible()


def test_report_pin_is_placed_by_map_click_without_snapping(page):  # B04 C12 (browser path)
    from tests.api.test_http import fresh_contributor
    open_as(page, fresh_contributor())
    page.goto(BASE + '/report/new')
    page.get_by_label('Unusual foam').check()
    page.get_by_role('button', name='Continue to location').click()
    canvas = page.locator('[data-map-ready="true"]')
    expect(canvas).to_be_visible(timeout=20000)
    canvas.click(position={'x': 200, 'y': 140})
    expect(page.get_by_text(re.compile('Pin placed at'))).to_be_visible()
    assert page.get_by_label('Latitude (optional)').input_value() != ''
    page.get_by_label('This stream is not on the map').check()
    page.get_by_role('button', name='Continue to review').click()
    page.get_by_role('button', name='Submit report').click()
    expect(page).to_have_url(re.compile(r'/reports/[0-9a-f-]+'))


def test_directory_map_and_list_show_precision(page):  # C12 H07
    open_as(page, 'coordinator@example.test')
    expect(page.get_by_text(re.compile(r'approximate, ±15 m'))).to_be_visible()
    page.get_by_role('button', name='Map', exact=True).click()
    expect(page.locator('[data-map-ready="true"]')).to_be_visible(timeout=20000)
    expect(page.locator('.maplibregl-ctrl-attrib')).to_contain_text('OpenFreeMap', timeout=20000)  # required attribution
    expect(page.locator('.maplibregl-ctrl-attrib')).to_contain_text('OpenStreetMap')
    expect(page.get_by_text(re.compile('have no confirmed coordinates and appear only in the list'))).to_be_visible()


FALLBACK = 'The background map is unavailable, so the map may be blank or incomplete. Use the list or coordinate fields, which hold the same information.'


def tiles_down(route):
    """The tile index answers but every tile fails. Vector tiles are fetched inside MapLibre's worker, where Playwright cannot
    route, so the index points them at a closed local port; raster tiles are refused directly."""
    if route.request.url.endswith('/planet'):
        index = route.fetch().json()
        index['tiles'] = ['http://127.0.0.1:9/{z}/{x}/{y}.pbf']
        return route.fulfill(json=index)
    return route.fulfill(status=503, body='unavailable') if '/natural_earth/' in route.request.url else route.continue_()


def provider_down(route):
    route.fulfill(status=503, body='unavailable')


def test_failing_basemap_provider_falls_back_to_the_list(page):  # H07
    open_as(page, 'coordinator@example.test')
    provider = re.compile(r'.*tiles\.openfreemap\.org/.*')
    for failure in (tiles_down, provider_down):
        page.route(provider, failure)
        page.goto(f'{BASE}/app/{ORG}/investigations')
        page.get_by_role('button', name='Map', exact=True).click()
        expect(page.get_by_text(FALLBACK)).to_be_visible(timeout=20000)  # labelled; never claims records it is not showing
        expect(page.get_by_text(re.compile('showing Upstream records'))).to_have_count(0)
        expect(page.get_by_role('heading', level=1)).to_be_visible()  # the workspace is not blank
        page.get_by_role('button', name='List', exact=True).click()
        expect(page.locator('#main-content a[href*="/investigations/"]').first).to_be_visible()  # the same records, as a list
        page.unroute(provider, failure)
    page.route(provider, tiles_down)
    page.goto(f'{BASE}/report/new')  # the reporting pin map: coordinates and landmark still work without it
    page.get_by_label('Visible discharge').check()
    page.get_by_role('button', name='Continue to location').click()
    expect(page.get_by_text(FALLBACK)).to_be_visible(timeout=20000)
    page.get_by_label('Latitude (optional)').fill('51.45')
    page.get_by_label('Longitude (optional)').fill('-2.59')
    page.get_by_role('button', name='Continue to review').click()
    expect(page.get_by_text(re.compile('51.45'))).to_be_visible()
