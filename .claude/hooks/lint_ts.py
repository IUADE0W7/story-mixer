#!/usr/bin/env python3
"""PostToolUse hook: run next lint --fix on edited TypeScript/TSX files."""
import json
import os
import subprocess
import sys

FRONTEND_ROOT = "/home/mikha/projects/story-mixer/frontend"

data = json.load(sys.stdin)
file_path = data.get("tool_input", {}).get("file_path") or \
            data.get("tool_response", {}).get("filePath", "")

if not file_path:
    sys.exit(0)

if not (file_path.endswith(".ts") or file_path.endswith(".tsx")):
    sys.exit(0)

if "/frontend/" not in file_path:
    sys.exit(0)

rel = os.path.relpath(file_path, FRONTEND_ROOT)
subprocess.run(
    ["./node_modules/.bin/next", "lint", "--fix", "--file", rel],
    cwd=FRONTEND_ROOT,
    capture_output=True,
)
