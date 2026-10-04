"""Fetch the OneAquaHealth FHIR IG (HL7 Europe) at a pinned commit and compile it with a pinned SUSHI into .cache/oah,
so the official validator can check Upstream bundles against LocationOah and ObservationIndicatorsOah.
The IG source is not vendored: it carries no explicit licence. Network use is explicit (run once)."""
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCK = json.loads((ROOT / "validator-lock.json").read_text())["oahIg"]
SRC, OUT = ROOT / ".cache" / "oah-src", ROOT / ".cache" / "oah"
KINDS = ("StructureDefinition", "CodeSystem", "ValueSet")


def build():
    if not (SRC / ".git").exists():
        subprocess.run(["git", "clone", "-q", LOCK["repo"], str(SRC)], check=True)
    subprocess.run(["git", "-C", str(SRC), "fetch", "-q", "origin", LOCK["commit"]], check=True)
    subprocess.run(["git", "-C", str(SRC), "checkout", "-q", LOCK["commit"]], check=True)
    subprocess.run(["npx", "-y", "fsh-sushi@" + LOCK["sushi"], "."], cwd=SRC, check=True, capture_output=True, shell=True)
    shutil.rmtree(OUT, ignore_errors=True); OUT.mkdir(parents=True)
    for f in (SRC / "fsh-generated" / "resources").glob("*.json"):
        if f.name.startswith(KINDS):
            shutil.copy(f, OUT / f.name)
    return OUT


if __name__ == "__main__":
    print(build())
