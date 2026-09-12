"""Integration test for main.py's `if __name__ == "__main__":` entrypoint.

Unit tests (tests/test_main.py) exercise main()'s exit-code logic directly,
but importing the module for pytest always sets __name__ to
"priceGenerator.main", never "__main__" -- so no import-based test can tell
whether the script-entry guard itself actually fires. This runs the module
as a real script (`python -m priceGenerator.main`) against a real, empty
Postgres to prove the guard triggers `sys.exit(main())` end-to-end.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

from priceGenerator.vendor_catalog import FAKE_VENDORS

pytestmark = pytest.mark.integration

_REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_TEST_DATABASE_URL = (
    "postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums"
)


def test_running_as_a_script_exits_zero_on_a_successful_run(db_connection):
    database_url = os.environ.get("DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    env = {**os.environ, "DATABASE_URL": database_url, "LOG_LEVEL": "INFO"}

    try:
        result = subprocess.run(
            [sys.executable, "-m", "priceGenerator.main"],
            capture_output=True,
            text=True,
            cwd=_REPO_ROOT,
            env=env,
            timeout=30,
        )
        assert result.returncode == 0, result.stderr
        # Not just "the process exited 0" (that's also true if the
        # __name__ == "__main__" guard never fires and main() never runs at
        # all) -- prove main() actually executed by checking its own
        # end-of-run summary log line landed on stderr (logging.basicConfig
        # default stream).
        assert "run summary" in result.stderr
    finally:
        # main.py's real run ensures the real FAKE_VENDORS catalog -- clean
        # it up so the shared dev DB is left as it was found.
        names = [v.name for v in FAKE_VENDORS]
        with db_connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM listings WHERE vendor_id IN (SELECT id FROM vendors WHERE name = ANY(%s))",
                (names,),
            )
            cursor.execute("DELETE FROM vendors WHERE name = ANY(%s)", (names,))
        db_connection.commit()
