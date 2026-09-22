import hashlib
import json
from .contracts import Snapshot


def canonical_bytes(snapshot: Snapshot) -> bytes:
    # Revalidation makes model_copy / internal callers obey the same API boundary.
    snapshot = Snapshot.model_validate(snapshot.model_dump(mode='json'))
    data = snapshot.model_dump(mode='json')
    for field, keys in [('readings', ('id', 'version')), ('backgrounds', ('station_id', 'version')), ('instruments', ('id', 'calibration_version')), ('waters', ('id',))]:
        unique = {tuple(row[k] for k in keys): row for row in data[field]}
        data[field] = [unique[key] for key in sorted(unique)]
    for field in ('reaches', 'stations'):
        data['network'][field] = sorted(data['network'][field], key=lambda item: item['id'])
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def canonical_hash(snapshot: Snapshot) -> str:
    return hashlib.sha256(canonical_bytes(snapshot)).hexdigest()
