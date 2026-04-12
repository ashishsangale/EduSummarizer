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

type RenameResponse = {
  old_filename: string;
  new_filename: string;
};

type ApiErrorPayload = {
  detail?: string;
  message?: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    if (text) {
      let parsed: ApiErrorPayload | null = null;
      try {
        parsed = JSON.parse(text) as ApiErrorPayload;
      } catch {
        parsed = null;
      }

      const detail = parsed?.detail || parsed?.message;
      if (detail) {
        throw new Error(detail);
      }

      throw new Error(text);
    }
    throw new Error(`Request failed with status ${response.status}`);
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

  await readJsonOrThrow<unknown>(response);
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

export async function renameSummary(filename: string, newName: string): Promise<string> {
  const response = await fetch(`${apiBase}/api/v1/summaries/${encodeURIComponent(filename)}/rename`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_name: newName }),
  });

  const data = await readJsonOrThrow<RenameResponse>(response);
  return data.new_filename;
}

export async function deleteSummary(filename: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/v1/summaries/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  await readJsonOrThrow<unknown>(response);
}
