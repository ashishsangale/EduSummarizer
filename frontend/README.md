# EduSummarizer Frontend (Next.js)

## 1) Install dependencies

```bash
cd frontend
npm install
```

## 2) Configure API URL

Copy `.env.example` to `.env.local` and adjust if needed.

```bash
cp .env.example .env.local
```

## 3) Run development server

```bash
npm run dev
```

Or from repo root (starts backend + frontend together):

```bash
./scripts/dev.sh
```

The app expects backend API at `http://localhost:8000` by default.
