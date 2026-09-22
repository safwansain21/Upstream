"""Run checksum-pinned official validator. Installation network is explicit."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from urllib.request import urlopen

from conformance import write_definitions


def main():
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundles", nargs="+", type=Path)
    parser.add_argument("--jar", type=Path, default=root / ".cache" / "validator_cli.jar")
    parser.add_argument("--download", action="store_true", help="Download missing pinned validator JAR")
    parser.add_argument("--base", default="https://upstream.example/fhir")
    parser.add_argument("--output", type=Path, default=root / "validation-results.json")
    parser.add_argument("--offline", action="store_true", help="Require installed FHIR package cache; forbid HTTP access")
    args = parser.parse_args()
    lock = json.loads((root / "validator-lock.json").read_text())
    if not args.jar.exists() and args.download:
        args.jar.parent.mkdir(parents=True, exist_ok=True)
        with urlopen(lock["url"], timeout=120) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != lock["sha256"]:
            raise ValueError("downloaded validator SHA-256 mismatch")
        args.jar.write_bytes(data)
    if hashlib.sha256(args.jar.read_bytes()).hexdigest() != lock["sha256"]:
        raise ValueError("validator SHA-256 mismatch")
    profiles = root / ".cache" / "profiles"
    write_definitions(profiles, args.base)
    command = ["java", "-Xmx2g", "-jar", str(args.jar), *map(str, args.bundles), "-version", lock["fhirVersion"],
               "-ig", lock["corePackage"], "-ig", str(profiles), "-tx", "n/a", "-output", str(args.output)]
    if args.offline:
        command.append("-no-http-access")
    completed = subprocess.run(command, check=False)
    return completed.returncode


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
