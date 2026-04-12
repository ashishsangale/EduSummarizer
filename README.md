# EduSummarizer (Cerebras LLM Migration)

This repo now includes:
- `backend/`: FastAPI API with local ASR (faster-whisper), Cerebras cloud LLM, MongoDB storage, and optional local retrieval (FAISS).
- `frontend/`: Next.js app replacing Streamlit UI.

## Quick Start

1) Install backend deps:

```bash
pip install -r backend/requirements.txt
```

2) Install frontend deps:

```bash
cd frontend
npm install
cd ..
```

3) Start MongoDB and set backend Cerebras API key in `.env`.

4) Run both services with one command:

```bash
./scripts/dev.sh
```

- Frontend: `http://localhost:3000`
- Backend docs: `http://localhost:8000/docs`

## Notes

- Legacy Streamlit files are archived under `legacy/` for reference.
- Set frontend API URL in `frontend/.env.local` from `frontend/.env.example` if needed.
