"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  askSummary,
  indexSummary,
  listSummaries,
  retrieveAsk,
  SummaryItem,
  transcribeAndSummarize,
} from "../lib/api";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [useRetrieval, setUseRetrieval] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedSummary = useMemo(
    () => summaries.find((item) => item.filename === selectedFile),
    [selectedFile, summaries],
  );

  async function loadSummaries() {
    const data = await listSummaries();
    setSummaries(data);
    if (!selectedFile && data.length > 0) {
      setSelectedFile(data[0].filename);
    }
  }

  useEffect(() => {
    loadSummaries().catch((err: Error) => setError(err.message));
  }, []);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setError("");
    setAnswer("");

    if (!file) {
      setError("Please choose an audio file first.");
      return;
    }

    setStatus("Transcribing and summarizing...");
    try {
      await transcribeAndSummarize(file);
      setStatus("Done.");
      await loadSummaries();
      setFile(null);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleAsk() {
    setError("");
    setAnswer("");

    if (!selectedFile) {
      setError("Select a summary first.");
      return;
    }
    if (!question.trim()) {
      setError("Type a question first.");
      return;
    }

    try {
      const result = useRetrieval
        ? await retrieveAsk(selectedFile, question)
        : await askSummary(selectedFile, question);
      setAnswer(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get answer");
    }
  }

  async function handleBuildIndex() {
    setError("");
    setAnswer("");
    if (!selectedFile) {
      setError("Select a summary first.");
      return;
    }

    setStatus("Indexing summary chunks...");
    try {
      const chunks = await indexSummary(selectedFile);
      setStatus(`Index built with ${chunks} chunks.`);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Indexing failed");
    }
  }

  return (
    <main>
      <h1>EduSummarizer</h1>

      <section className="card">
        <h2>Upload Audio</h2>
        <form onSubmit={handleUpload}>
          <label htmlFor="audio">Audio file</label>
          <input
            id="audio"
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div>
            <button type="submit">Transcribe & Summarize</button>
          </div>
        </form>
        {status && <p className="muted">{status}</p>}
      </section>

      <section className="card">
        <h2>Saved Summaries</h2>
        {summaries.length === 0 ? (
          <p className="muted">No summaries yet.</p>
        ) : (
          <div>
            <label htmlFor="summary-select">Choose file</label>
            <select
              id="summary-select"
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
            >
              {summaries.map((item) => (
                <option key={item.filename} value={item.filename}>
                  {item.filename}
                </option>
              ))}
            </select>

            {selectedSummary && (
              <>
                <h3>{selectedSummary.filename}</h3>
                <p>{selectedSummary.summary}</p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Ask About Summary</h2>
        <label htmlFor="question">Question</label>
        <textarea
          id="question"
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="row">
          <label htmlFor="retrieval-mode">Use retrieval</label>
          <input
            id="retrieval-mode"
            type="checkbox"
            checked={useRetrieval}
            onChange={(e) => setUseRetrieval(e.target.checked)}
          />
        </div>
        <div className="row">
          <button type="button" onClick={handleBuildIndex}>
            Build Retrieval Index
          </button>
          <button type="button" onClick={handleAsk}>
            {useRetrieval ? "Retrieve + Answer" : "Get Answer"}
          </button>
        </div>

        {answer && (
          <>
            <h3>Answer</h3>
            <p>{answer}</p>
          </>
        )}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  );
}
