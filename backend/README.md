# EduSummarizer Backend (FastAPI, Cerebras LLM)

## 1) Install dependencies

```bash
pip install -r backend/requirements.txt
```

## 2) Required local services

- MongoDB running locally (or set `MONGO_URI` in `.env`)
- Cerebras API key

## 3) Optional `.env`

```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=edusummarize
MONGO_COLLECTION_NAME=edusummarize
WHISPER_MODEL_SIZE=base
WHISPER_COMPUTE_TYPE=int8
CEREBRAS_API_KEY=your_key_here
CEREBRAS_BASE_URL=https://api.cerebras.ai/v1
CEREBRAS_CHAT_MODEL=gpt-oss-120b
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
UPLOAD_DIR=data/uploads
RETRIEVAL_DIR=data/retrieval
```

## 4) Run API

```bash
uvicorn backend.main:app --reload
```

Or from repo root (starts backend + frontend):

```bash
./scripts/dev.sh
```

## 5) Core endpoints

- `GET /health`
- `POST /api/v1/summaries/transcribe-and-summarize` (multipart `file`)
- `GET /api/v1/summaries`
- `GET /api/v1/summaries/{filename}`
- `DELETE /api/v1/summaries/{filename}`
- `POST /api/v1/summaries/{filename}/ask`
- `POST /api/v1/summaries/{filename}/index`
- `POST /api/v1/summaries/{filename}/retrieve-ask`
