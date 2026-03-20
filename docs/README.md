# Running LoreForge (local development)

This document shows concise commands to run the backend and frontend locally, how to configure Ollama when running under WSL, and useful verification steps used in this repo.

Prerequisites

- Python (3.10+ / system default used in project)
- Node.js and npm (for the frontend)
- Ollama installed and running (on Windows host when using WSL)

Backend (WSL / Linux)

1. Activate your virtual environment (project uses `.venv` in examples):

```bash
source .venv/bin/activate
```

2. Ensure the app knows how to reach Ollama. If Ollama runs on the Windows host and you're in WSL, compute the Windows host IP and export `OLLAMA_BASE_URL`:

```bash
# compute WSL default gateway (Windows host) and export base URL
python3 - <<'PY'
with open('/proc/net/route') as f:
    for line in f:
        fields=line.strip().split()
        if len(fields)>=3 and fields[1]=='00000000' and fields[0] != 'Iface':
            gateway_hex=fields[2]
            gateway_int=int(gateway_hex,16)
            ip='.'.join(str((gateway_int >> (8*i)) & 0xFF) for i in range(4))
            print(f"export OLLAMA_BASE_URL=http://{ip}:11434")
            break
PY

# then run the printed export command, or export manually:
export OLLAMA_BASE_URL=http://172.19.160.1:11434
```

3. Start the backend (example using the project's `.venv`):

```bash
# provide a DATABASE_URL as needed; the app reads .env by default
DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

Frontend

1. Install and run:

```bash
cd frontend
npm install
npm run dev
```

Quick validation and checks

- Run the repository helper script that checks Ollama CLI and API reachability from the environment: `check_ollama.sh`

```bash
chmod +x check_ollama.sh
./check_ollama.sh
```

- Test the long-form generation endpoint against the running backend:

```bash
curl -sS -H "Content-Type: application/json" -X POST http://127.0.0.1:8001/api/v1/stories/generate-long-form \
  -d '{"context": {"user_prompt": "Write a compact noir opening.", "public_title": "Noir Test", "audience": "adult", "continuity_notes": []}, "vibe": {"aggression": 6, "reader_respect": 7, "morality": 5, "source_fidelity": 7}, "provider": {"provider": "ollama", "model": "gpt-oss:20b", "judge_model": "gpt-oss:20b", "temperature": 0.7}, "chapter_count": 2, "chapter_word_target": 200, "stream": true}' \
  -w "\nHTTP_STATUS:%{http_code}\n"
```

Notes

- If you prefer Ollama to listen on all interfaces from Windows, set `OLLAMA_HOST=0.0.0.0` before starting Ollama on Windows (preferred to using netsh portproxy), then use the Windows host IP as `OLLAMA_BASE_URL`.
- The backend autodetects a reasonable default `OLLAMA_BASE_URL` when running under WSL; if autodetection fails, set `OLLAMA_BASE_URL` explicitly or edit `backend/.env`.
- See `backend/.env` for example environment variable settings and comments.

Files referenced in this README

- `check_ollama.sh` — repo helper that probes Ollama CLI and API
- `backend/.env` — environment examples used by the backend
