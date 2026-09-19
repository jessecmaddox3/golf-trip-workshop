#!/usr/bin/env python3
"""Package only explicitly reviewed source files, never a whole working folder."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]
names = json.loads((ROOT / "release-files.json").read_text())
if not isinstance(names, list) or len(names) != len(set(names)):
    raise SystemExit("Release allowlist must contain unique paths.")
files = []
for name in sorted(names):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or "\\" in name:
        raise SystemExit("Invalid release path.")
    if any(p in {".git", ".local", "node_modules", "dist", "dist-private", "artifacts", "__pycache__"} for p in path.parts) or name.startswith("public/private/") or (path.name.startswith(".env") and name != ".env.example"):
        raise SystemExit("Private/generated paths cannot enter a source release.")
    source = ROOT.joinpath(*path.parts)
    if not source.is_file() or any(p.is_symlink() for p in [source, *source.parents] if p != ROOT.parent):
        raise SystemExit("Release paths must be ordinary files in the project.")
    if not source.resolve().is_relative_to(ROOT):
        raise SystemExit("Release path escapes the project.")
    files.append((name, source.read_bytes(), 0o755 if source.stat().st_mode & stat.S_IXUSR else 0o644))
checksums = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data, _ in files).encode()
out = ROOT / "artifacts" / "golf-trip-workshop.zip"
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data, mode in files + [("SHA256SUMS", checksums, 0o644)]:
        info = zipfile.ZipInfo("golf-trip-workshop/" + name, date_time=(2026, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | mode) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
print(f"Packaged {len(files)} allowlisted files: {out}")
print("SHA256 " + hashlib.sha256(out.read_bytes()).hexdigest())
