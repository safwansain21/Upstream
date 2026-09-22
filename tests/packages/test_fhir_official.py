"""F13: official HL7 validator (checksum-pinned) reports zero errors on a bundle built from a real approved assessment,
with semantic assertions: no clinical person/patient fiction and no Location subject on DocumentReference."""
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

from services.api.db import transaction
from services.packages import build_package
from services.worker.exports import payload

ROOT = Path(__file__).resolve().parents[2]
FHIR = ROOT / 'exports/fhir'
JAR = FHIR / '.cache/validator_cli.jar'


@pytest.mark.skipif(not JAR.exists(), reason='run exports/fhir/validate.py --download once to install the pinned validator')
def test_official_validator_zero_errors_on_real_export(tmp_path):
    with transaction(worker=True) as db:
        row = db.execute("select org_id,assessment_id from evidence_packages where private.publication_status(assessment_id)='approved' order by created_at desc limit 1").fetchone()
        if not row:  # create one through the normal review path
            from tests.api.test_exports import approved_case, export
            _, a = approved_case()
            export(a['id'])
            row = db.execute("select org_id,assessment_id from evidence_packages where assessment_id=%s", (a['id'],)).fetchone()
        data, _ = payload(db, row['org_id'], row['assessment_id'], 'fhir-official-check')
    bundle = build_package(data, include_fhir=True).artifacts['bundle.fhir.json']
    resources = [e['resource'] for e in json.loads(bundle)['entry']]
    types = Counter(r['resourceType'] for r in resources)
    assert not {'Patient', 'RelatedPerson', 'Practitioner', 'Condition', 'CarePlan'} & set(types)
    assert all('subject' not in r for r in resources if r['resourceType'] == 'DocumentReference')
    path, out = tmp_path / 'bundle.json', tmp_path / 'results.json'
    path.write_bytes(bundle)
    subprocess.run([sys.executable, 'validate.py', str(path), '--output', str(out)], cwd=FHIR, check=False, timeout=900, capture_output=True)
    issues = json.loads(out.read_text())['issue']
    errors = [i for i in issues if i['severity'] in ('error', 'fatal')]
    assert errors == [], errors
    documented = (ROOT / 'docs/fhir-validation.md').read_text(encoding='utf-8')
    for text in {i['details']['text'][:60] for i in issues if i['severity'] == 'warning'}:
        assert text.split(' because')[0][:50] in documented, f'undocumented warning: {text}'
