"""Verify downloaded package bytes against independently trusted inputs."""
import argparse
import json
from pathlib import Path
import sys

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .core import verify_package


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--public-key", type=Path, help="Independently trusted Ed25519 PEM public key")
    parser.add_argument("--manifest-hash")
    parser.add_argument("--predecessor-hash")
    parser.add_argument("--require-signature", action="store_true")
    args = parser.parse_args()
    try:
        key = serialization.load_pem_public_key(args.public_key.read_bytes()) if args.public_key else None
        if key is not None and not isinstance(key, Ed25519PublicKey):
            raise ValueError("Ed25519 public key required")
        files = list(args.directory.iterdir())
        if any(not path.is_file() or path.is_symlink() for path in files):
            raise ValueError("package directory must contain only regular artifact files")
        result = verify_package({path.name: path.read_bytes() for path in files}, public_key=key,
                                expected_manifest_hash=args.manifest_hash, expected_predecessor_hash=args.predecessor_hash,
                                require_signature=args.require_signature)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError) as exc:
        print("Verification failed: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
