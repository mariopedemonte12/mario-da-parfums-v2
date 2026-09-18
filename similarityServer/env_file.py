"""Optional repo-root env file loader (see specs/single-root-env.md).

The single env file lives at `<repo root>/.env`, one level above this
package. It is OPTIONAL: inside the Docker image the package sits at
`/app/similarityServer`, `/app/.env` does not exist, and the process
environment (set by Compose) is the only source. Real environment variables
always win over the file (`override=False`).
"""

from pathlib import Path

from dotenv import load_dotenv

ROOT_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_root_env(path: Path | None = None) -> bool:
    """Load the root env file if it exists. Returns True when a file was loaded.

    Never raises for a missing file; never overrides variables already set.
    """
    target = ROOT_ENV_PATH if path is None else path
    if not target.is_file():
        return False
    load_dotenv(target, override=False)
    return True
