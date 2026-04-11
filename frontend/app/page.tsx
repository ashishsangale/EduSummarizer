"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [useRetrieval, setUseRetrieval] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  useEffect(() => {
    return () => {
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [recordingUrl]);

  async function handleStartRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaStreamRef.current = stream;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setRecordingBlob(blob);
        if (recordingUrl) {
          URL.revokeObjectURL(recordingUrl);
        }
        setRecordingUrl(URL.createObjectURL(blob));
        setIsRecording(false);

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setStatus("Recording in progress...");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start recording");
    }
  }

  function handleStopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    recorder.stop();
    setStatus("Recording captured. You can now summarize it.");
  }

  function handleUseRecording() {
    if (!recordingBlob) {
      setError("No recording available yet.");
      return;
    }

    const timestamp = Date.now();
    const recordedFile = new File([recordingBlob], `recorded_${timestamp}.webm`, {
      type: recordingBlob.type || "audio/webm",
    });
    setFile(recordedFile);
    setStatus(`Selected recording: ${recordedFile.name}`);
    setError("");
  }

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
        <hr />
        <h3>Record Audio</h3>
        <div className="row">
          <button type="button" onClick={handleStartRecording} disabled={isRecording}>
            Start Recording
          </button>
          <button type="button" onClick={handleStopRecording} disabled={!isRecording}>
            Stop Recording
          </button>
          <button type="button" onClick={handleUseRecording} disabled={!recordingBlob}>
            Use Recording
          </button>
        </div>
        {recordingUrl && <audio controls src={recordingUrl} />}
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
