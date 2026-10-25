"""Read-only independent oracle for the pinned official portable Node archive.

The expected tree comes from authenticated ZIP bytes, never a current directory
measurement. No extraction, installation, key creation or model call occurs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import zipfile

PIN = "d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5"
PREFIX = "node-v24.22.1-win-x64/"


def digest_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify(archive, runtime):
    archive, runtime = Path(archive), Path(runtime)
    if archive.is_symlink() or runtime.is_symlink():
        raise ValueError("Pinned archive/runtime cannot be redirected")
    if digest_file(archive) != PIN:
        raise ValueError("Official Node ZIP SHA256 mismatch")
    expected = {".": {"path": ".", "type": "directory"}}
    total = 0
    with zipfile.ZipFile(archive) as package:
        infos = package.infolist()
        if len(infos) > 20000:
            raise ValueError("Unexpected Node archive member count")
        names = set()
        for info in infos:
            if not info.filename.startswith(PREFIX) or info.flag_bits & 1:
                raise ValueError("Unrecognized/encrypted official archive member")
            name = info.filename[len(PREFIX):].rstrip("/")
            if not name:
                continue
            parts = PurePosixPath(name).parts
            if "\\" in name or ":" in name or name.startswith("/") or any(x in ("", ".", "..") for x in parts):
                raise ValueError("Unsafe official archive member")
            if name.lower() in names:
                raise ValueError("Duplicate/colliding archive member")
            names.add(name.lower())
            for index in range(1, len(parts)):
                parent = "/".join(parts[:index])
                expected.setdefault(parent, {"path": parent, "type": "directory"})
            target = runtime.joinpath(*parts)
            if target.is_symlink() or not target.exists():
                raise ValueError("Missing or redirected runtime member: " + name)
            if info.is_dir():
                if not target.is_dir():
                    raise ValueError("Runtime directory type mismatch: " + name)
                expected[name] = {"path": name, "type": "directory"}
            else:
                total += info.file_size
                if total > 512 * 1024 * 1024 or info.file_size > 256 * 1024 * 1024:
                    raise ValueError("Official archive exceeds reviewed limits")
                data = package.read(info)  # Includes ZIP CRC verification.
                h = hashlib.sha256(data).hexdigest()
                if not target.is_file() or target.stat().st_nlink > 1 or target.stat().st_size != len(data) or digest_file(target) != h:
                    raise ValueError("Runtime bytes differ from official ZIP: " + name)
                expected[name] = {"path": name, "type": "file", "bytes": len(data), "sha256": h}
    actual = {"."}
    for parent, dirs, files in os.walk(runtime, followlinks=False):
        for name in dirs + files:
            path = Path(parent) / name
            if path.is_symlink() or stat.S_ISLNK(path.lstat().st_mode):
                raise ValueError("Unexpected runtime link")
            actual.add(path.relative_to(runtime).as_posix())
    if actual != set(expected):
        raise ValueError("Unlisted/missing runtime member: " + str(sorted(actual ^ set(expected))[:5]))
    entries = sorted(expected.values(), key=lambda entry: entry["path"])
    tree = hashlib.sha256(json.dumps({"entries": entries}, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    return {"ok": True, "authority": "official-archive-sha256", "archiveSha256": PIN, "runtime": str(runtime.resolve()), "expectedTreeSha256": tree, "entryCount": len(entries), "totalBytes": total}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--runtime", required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.archive, args.runtime)))
