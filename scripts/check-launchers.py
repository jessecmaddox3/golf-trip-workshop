#!/usr/bin/env python3
"""Install and launch the source ZIP in an isolated folder containing spaces."""
from pathlib import Path
import hashlib
import os
import platform
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="golf launcher ") as temporary:
    base = Path(temporary)
    with zipfile.ZipFile(ROOT / "artifacts/golf-trip-workshop.zip") as archive:
        archive.extractall(base)
        for entry in archive.infolist():
            (base / entry.filename).chmod((entry.external_attr >> 16) & 0o777)
    project = base / "golf-trip-workshop"
    for row in (project / "SHA256SUMS").read_text().splitlines():
        expected, name = row.split("  ", 1)
        assert hashlib.sha256((project / name).read_bytes()).hexdigest() == expected, name
    env = dict(os.environ, NODE_ENV="production", npm_config_omit="dev", GOLF_MODE="production", GOLF_CONFIG=str(base / "missing-private.json"), GOLF_DATA_DIR=str(base / "unused production"), GOLF_DEMO_DATA_DIR=str(base / "invented demo"), GOLF_STORAGE="redis", GOLF_OCR_ENABLED="yes", GOLF_WEATHER_ENABLED="yes", GEMINI_API_KEY="invented-unused", GEMINI_MODEL="invented-unused", UPSTASH_REDIS_REST_URL="https://invented.invalid", UPSTASH_REDIS_REST_TOKEN="invented-unused", PORT="0")
    system = platform.system()
    command = ["cmd", "/c", "Start.cmd"] if system == "Windows" else ["bash", "Start.command"] if system == "Darwin" else ["sh", "start.sh"]
    subprocess.run([*command, "--smoke-test", "--no-open"], cwd=project, env=env, check=True, timeout=240)
    assert not (base / "unused production").exists()
    assert (base / "invented demo/store/state.json").is_file()
    print(f"Extracted ZIP, checksums and {system} launcher passed.")
