"""Local browser checks with a fixture Supabase server; no live accounts or writes."""
import base64
import json
import threading
import time
import subprocess
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

TODAY = datetime.strptime(subprocess.check_output(["node", "-e", "process.stdout.write(new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London'}).format(new Date()))"]).decode(), "%Y-%m-%d").date()
RUN_ID = "00000000-0000-4000-8000-000000000001"
BOOKING_ID = "00000000-0000-4000-8000-000000000002"
STAFF_ID = "00000000-0000-4000-8000-000000000003"
OFFERING = {"title": "Beginners Foundation", "slug": "beginners-foundation", "type": "course"}
USER = {"id": STAFF_ID, "email": "door@example.test", "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}
RUN = {"id": RUN_ID, "label": "Level 2 - Tuesdays", "starts_on": str(TODAY), "ends_on": str(TODAY + timedelta(days=21)), "starts_at_local": "19:30:00", "ends_at_local": "21:30:00", "capacity": 25, "offering_id": "offering-id", "offering": OFFERING, "venue": {"name": "Honor Oak"}}
PERSON = {"id": "person-id", "name": "Example Skater", "medical_notes": "Example safety note", "dob": "1990-01-01", "default_travel_method": None, "person_id": None, "account_id": "account-id", "account": {"user_id": STAFF_ID}, "emergency_contact_name": "Example Contact", "emergency_contact_phone": "07000000000"}
BOOKING = {"id": BOOKING_ID, "status": "confirmed", "source": "online", "expires_at": None, "price_paid_pence": 5500, "participant": PERSON, "course_run_id": RUN_ID, "occurrence_id": None, "course_run": RUN, "occurrence": None}
ATTENDANCE = set()
UNEXPECTED = []


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        if url.path == "/auth/v1/user" or url.path.startswith("/auth/v1/admin/users/"):
            return self.reply(USER)
        if url.path == "/rest/v1/mem_waiver_consents":
            return self.reply([{"participant_id": PERSON["id"]}])
        if url.path == "/rest/v1/mem_course_runs":
            return self.reply([RUN])
        if url.path == "/rest/v1/mem_bookings":
            return self.reply([BOOKING])
        if url.path == "/rest/v1/mem_course_attendance":
            date = query.get("session_date", [""])[0].removeprefix("eq.")
            return self.reply([{"booking_id": bid} for bid, day in ATTENDANCE if day == date])
        if url.path == "/rest/v1/mem_occurrences":
            return self.reply([])
        UNEXPECTED.append(url.path)
        self.reply({"message": "Unexpected fixture request"}, 500)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or "{}")
        if self.path == "/rest/v1/rpc/mem_check_in_course_booking":
            assert body["p_checked_in_by"] == STAFF_ID
            key = (body["p_booking_id"], body["p_session_date"])
            inserted = key not in ATTENDANCE
            ATTENDANCE.add(key)
            return self.reply(inserted)
        UNEXPECTED.append(self.path)
        self.reply({"message": "Unexpected fixture mutation"}, 500)


def encoded(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


def main():
    fixture = ThreadingHTTPServer(("127.0.0.1", 3026), FixtureHandler)
    threading.Thread(target=fixture.serve_forever, daemon=True).start()
    expires = int(time.time()) + 3600
    jwt = encoded({"alg": "HS256", "typ": "JWT"}) + "." + encoded({"sub": STAFF_ID, "exp": expires, "iat": int(time.time()), "aud": "authenticated", "role": "authenticated", "email": USER["email"]}) + ".fixture"
    session = {"access_token": jwt, "refresh_token": "fixture-refresh", "token_type": "bearer", "expires_in": 3600, "expires_at": expires, "user": USER}
    output = Path(__file__).resolve().parent.parent / ".verification"
    output.mkdir(exist_ok=True)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context()
            context.add_cookies([{"name": "sb-127-auth-token", "value": "base64-" + encoded(session), "domain": "localhost", "path": "/"}])
            page = context.new_page()
            for base, register in [("/checkin", "/checkin/registers/run"), ("/admin/checkin", "/admin/registers/run")]:
                page.goto("http://localhost:3025" + base)
                page.wait_for_load_state("networkidle")
                page.get_by_role("heading", name="Beginners Foundation", exact=True).wait_for()
                page.get_by_role("link", name="Level 2 - Tuesdays").click()
                page.wait_for_url(f"**{register}/{RUN_ID}?date=*")
                page.wait_for_load_state("networkidle")
                assert register in page.url
                page.get_by_role("heading", name="Beginners Foundation", exact=True).wait_for()
                if base == "/admin/checkin":
                    page.get_by_text("Checked in", exact=True).wait_for()
                for width in [375, 768]:
                    page.set_viewport_size({"width": width, "height": 900})
                    page.screenshot(path=str(output / f"foundation-{base.strip('/').replace('/', '-')}-{width}.png"), full_page=True)
                    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), page.evaluate("({width:innerWidth, scroll:document.documentElement.scrollWidth, elements:[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({tag:e.tagName, cls:e.className, right:e.getBoundingClientRect().right, position:getComputedStyle(e).position}))})")
                if base == "/checkin":
                    page.get_by_role("button", name="Show details for Example Skater").click()
                    page.get_by_text("Example safety note", exact=True).wait_for()
                    page.get_by_text("Example Contact", exact=False).wait_for()
                    page.get_by_role("button", name="Mark attended", exact=True).click()
                    page.get_by_text("Checked in", exact=True).wait_for()
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    page.get_by_text("Checked in", exact=True).wait_for()
                    next_date = str(TODAY + timedelta(days=7))
                    page.goto(f"http://localhost:3025{register}/{RUN_ID}?date={next_date}")
                    page.wait_for_load_state("networkidle")
                    page.get_by_text("Check-in opens on the session date.").wait_for()
                    assert page.get_by_role("button", name="Mark attended", exact=True).count() == 0
                    assert page.get_by_text("Checked in", exact=True).count() == 0
            assert ATTENDANCE == {(BOOKING_ID, str(TODAY))}
            assert not UNEXPECTED, UNEXPECTED
            browser.close()
        print("Browser checks passed: both staff routes, phone/tablet layout, safety details, saved check-in, reload, independent weeks, future-date block.")
    finally:
        fixture.shutdown()


if __name__ == "__main__":
    main()
