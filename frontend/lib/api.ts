export type SummaryItem = {
  filename: string;
  summary: string;
  transcription?: string;
  created_at?: string;
  updated_at?: string;
};

type AskResponse = {
  answer: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function listSummaries(): Promise<SummaryItem[]> {
  const response = await fetch(`${apiBase}/api/v1/summaries`, { cache: "no-store" });
  return readJsonOrThrow<SummaryItem[]>(response);
}

export async function transcribeAndSummarize(file: File): Promise<void> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${apiBase}/api/v1/summaries/transcribe-and-summarize`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload failed");
  }
}

export async function askSummary(filename: string, question: string): Promise<string> {
  const response = await fetch(`${apiBase}/api/v1/summaries/${encodeURIComponent(filename)}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  const data = await readJsonOrThrow<AskResponse>(response);
  return data.answer;
}

export async function indexSummary(filename: string): Promise<number> {
  const response = await fetch(`${apiBase}/api/v1/summaries/${encodeURIComponent(filename)}/index`, {
    method: "POST",
  });

  const data = await readJsonOrThrow<{ chunks_indexed: number }>(response);
  return data.chunks_indexed;
}

export async function retrieveAsk(filename: string, question: string): Promise<string> {
  const response = await fetch(
    `${apiBase}/api/v1/summaries/${encodeURIComponent(filename)}/retrieve-ask`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
  );

  const data = await readJsonOrThrow<AskResponse>(response);
  return data.answer;
}
