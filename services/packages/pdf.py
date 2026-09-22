"""Server Chromium printing with scripts, workers and outbound requests disabled."""
import os


def render_pdf(report: str) -> bytes:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        options = {"headless": True, "args": ["--disable-background-networking", "--disable-component-update", "--no-first-run"]}
        executable = os.environ.get("UPSTREAM_CHROMIUM_EXECUTABLE")
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            context = browser.new_context(java_script_enabled=False, service_workers="block", offline=True)
            context.route("**/*", lambda route: route.abort())
            page = context.new_page()
            page.set_content(report, wait_until="load", timeout=30000)
            return page.pdf(format="A4", print_background=True, prefer_css_page_size=True)
        finally:
            browser.close()
