import subprocess
import sys


def test_validator_runner_rejects_substituted_jar_before_execution(tmp_path):
    jar = tmp_path / "validator.jar"
    jar.write_bytes(b"untrusted substituted executable")
    result = subprocess.run([sys.executable, "exports/fhir/validate.py", "exports/fhir/example-bundle.json", "--jar", str(jar)], capture_output=True, text=True)
    assert result.returncode != 0
    assert "SHA-256 mismatch" in result.stderr
