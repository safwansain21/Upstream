"""J09: database and object-storage backup restored into an isolated stack, then verified (runs a second local Supabase stack)."""
from scripts.backup_restore import DRILL, drill


def test_backup_restores_into_an_isolated_stack_and_verifies(tmp_path):  # J09
    result = drill(tmp_path / 'backup')
    assert result['tables']['cases'] > 0 and result['tables']['auth.users'] > 0  # counts equal the source (asserted in verify)
    assert result['objects'] == result['backup_objects'] > 0  # every object restored with the same SHA-256
    assert result['packages_verified'] > 0  # evidence packages verify from restored storage against recorded hashes
    assert result['example_sign_in']  # restored auth accepts an existing account
    assert not DRILL.exists()  # the isolated stack is stopped and removed afterwards
