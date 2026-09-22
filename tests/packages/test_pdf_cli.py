import io
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from services.packages import build_package


def test_real_pdf_contains_reviewed_content_and_blocks_external_requests(payload):
    from services.packages.pdf import render_pdf
    requests = []
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            self.send_response(200)
            self.end_headers()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        pdf = render_pdf(f'<html><body>Network isolated report<img src="http://127.0.0.1:{server.server_port}/secret"><script>document.body.textContent="executed"</script></body></html>')
        assert pdf.startswith(b"%PDF-") and len(pdf) > 1000
        assert requests == []
        package = build_package(payload, pdf_renderer=render_pdf)
        from pypdf import PdfReader
        text = " ".join(page.extract_text() for page in PdfReader(io.BytesIO(package.artifacts["report.pdf"])).pages)
        for content in ["assessment-1 version 2", "synthetic", "One sustained nonnegative input", "1.250 km", "reach-1", "42.1"]:
            assert content in text
    finally:
        server.shutdown()
        server.server_close()


def test_cli_verifies_signature_and_rejects_tampering(payload, tmp_path):
    private = Ed25519PrivateKey.generate()
    package = build_package(payload, private_key=private, key_id="test")
    folder = tmp_path / "package"
    folder.mkdir()
    for name, data in package.artifacts.items():
        (folder / name).write_bytes(data)
    key = tmp_path / "public.pem"
    key.write_bytes(private.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    args = [sys.executable, "-m", "services.packages", str(folder), "--public-key", str(key), "--manifest-hash", package.manifest_hash, "--require-signature"]
    result = subprocess.run(args, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["signature_status"] == "verified"
    (folder / "assessment.json").write_bytes(b"tampered")
    result = subprocess.run(args, capture_output=True, text=True)
    assert result.returncode != 0 and "integrity" in result.stderr
