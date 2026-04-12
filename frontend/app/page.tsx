"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  askSummary,
  deleteSummary,
  indexSummary,
  listSummaries,
  renameSummary,
  retrieveAsk,
  SummaryItem,
  transcribeAndSummarize,
} from "../lib/api";

type QaItem = {
  question: string;
  answer: string;
  mode: "direct" | "retrieval";
  createdAt: number;
};

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1");
}

function FormattedText({ text }: { text: string }) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return null;
  }

  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim());

  return (
    <div className="formatted-text">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const isList = lines.length > 0 && lines.every((line) => /^[-*•]\s+/.test(line));

        if (isList) {
          return (
            <ul key={`list-${index}`} className="text-list">
              {lines.map((line, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>
                  {cleanInlineMarkdown(line.replace(/^[-*•]\s+/, ""))}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`p-${index}`} className="text-block">
            {cleanInlineMarkdown(block)}
          </p>
        );
      })}
    </div>
  );
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot) : "";
}

function formatDate(value?: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatElapsed(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function toUserError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : fallback;
  if (message.includes("CEREBRAS_API_KEY")) {
    return "Backend LLM key is missing. Add CEREBRAS_API_KEY in backend .env and restart backend.";
  }
  return message;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");

  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [questionsByFile, setQuestionsByFile] = useState<Record<string, string>>({});
  const [historyByFile, setHistoryByFile] = useState<Record<string, QaItem[]>>({});
  const [retrievalByFile, setRetrievalByFile] = useState<Record<string, boolean>>({});
  const [isAnswering, setIsAnswering] = useState(false);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardOnStopRef = useRef(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  const selectedSummary = useMemo(
    () => summaries.find((item) => item.filename === selectedFile),
    [selectedFile, summaries],
  );

  const currentQuestion = selectedFile ? questionsByFile[selectedFile] || "" : "";
  const currentHistory = selectedFile ? historyByFile[selectedFile] || [] : [];
  const currentUseRetrieval = selectedFile ? retrievalByFile[selectedFile] || false : false;

  async function loadSummaries(preferredSelection?: string) {
    const data = await listSummaries();
    setSummaries(data);

    setSelectedFile((current) => {
      if (preferredSelection && data.some((item) => item.filename === preferredSelection)) {
        return preferredSelection;
      }
      if (current && data.some((item) => item.filename === current)) {
        return current;
      }
      return "";
    });
  }

  useEffect(() => {
    loadSummaries().catch((err) => setError(toUserError(err, "Failed to load recordings")));
  }, []);

  useEffect(() => {
    if (!isRecording || !recordingStartedAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartedAt) / 1000);
      setRecordingSeconds(elapsed);
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [isRecording, recordingStartedAt]);

  useEffect(() => {
    if (!status) {
      return;
    }

    const timeoutId = window.setTimeout(() => setStatus(""), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => {
    if (!chatLogRef.current) {
      return;
    }

    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [selectedFile, currentHistory.length, isAnswering]);

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

  function clearSelectedUpload() {
    setFile(null);
    setUploadName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearRecordedPreview() {
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
    }
    setRecordingBlob(null);
    setRecordingUrl("");
  }

  function resetRecordingTimer() {
    setRecordingStartedAt(null);
    setRecordingSeconds(0);
  }

  async function handleStartRecording() {
    setError("");
    setStatus("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      discardOnStopRef.current = false;
      mediaStreamRef.current = stream;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const discard = discardOnStopRef.current;
        discardOnStopRef.current = false;

        if (discard) {
          clearRecordedPreview();
          setStatus("Recording discarded");
        } else {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          clearRecordedPreview();
          setRecordingBlob(blob);
          setRecordingUrl(URL.createObjectURL(blob));
          setStatus("Recording ready to use");
        }

        setIsRecording(false);
        resetRecordingTimer();

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingStartedAt(Date.now());
      setRecordingSeconds(0);
      setStatus("Recording started");
    } catch (err) {
      setError(toUserError(err, "Unable to start recording"));
    }
  }

  function handleStopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
    setStatus("Finalizing recording");
  }

  function handleCancelRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      discardOnStopRef.current = true;
      recorder.stop();
      return;
    }

    clearRecordedPreview();
    resetRecordingTimer();
    setStatus("Recording discarded");
  }

  function handleUseRecording() {
    if (!recordingBlob) {
      setError("No recording available yet.");
      return;
    }

    const recordedFile = new File([recordingBlob], `recorded_${Date.now()}.webm`, {
      type: recordingBlob.type || "audio/webm",
    });

    setFile(recordedFile);
    setUploadName(stripExtension(recordedFile.name));
    setStatus(`Selected recording: ${recordedFile.name}`);
    setError("");
  }

  function buildUploadFile(): File | null {
    if (!file) {
      return null;
    }

    const trimmed = uploadName.trim();
    if (!trimmed) {
      return file;
    }

    const safeBase = trimmed.replace(/[\\/]/g, "_");
    const ext = extensionOf(file.name);
    const finalName = safeBase.includes(".") ? safeBase : `${safeBase}${ext}`;

    if (finalName === file.name) {
      return file;
    }

    return new File([file], finalName, {
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("");

    const fileToUpload = buildUploadFile();
    if (!fileToUpload) {
      setError("Please choose an audio file first.");
      return;
    }

    setStatus("Transcribing and summarizing");

    try {
      await transcribeAndSummarize(fileToUpload);
      await loadSummaries(fileToUpload.name);
      clearSelectedUpload();
      setStatus("Saved");
    } catch (err) {
      setStatus("");
      setError(toUserError(err, "Upload failed"));
    }
  }

  function movePerFileState(oldName: string, newName: string) {
    setQuestionsByFile((prev) => {
      if (!(oldName in prev)) {
        return prev;
      }
      const copy = { ...prev };
      copy[newName] = copy[oldName];
      delete copy[oldName];
      return copy;
    });

    setHistoryByFile((prev) => {
      if (!(oldName in prev)) {
        return prev;
      }
      const copy = { ...prev };
      copy[newName] = copy[oldName];
      delete copy[oldName];
      return copy;
    });

    setRetrievalByFile((prev) => {
      if (!(oldName in prev)) {
        return prev;
      }
      const copy = { ...prev };
      copy[newName] = copy[oldName];
      delete copy[oldName];
      return copy;
    });
  }

  function removePerFileState(filename: string) {
    setQuestionsByFile((prev) => {
      if (!(filename in prev)) {
        return prev;
      }
      const copy = { ...prev };
      delete copy[filename];
      return copy;
    });

    setHistoryByFile((prev) => {
      if (!(filename in prev)) {
        return prev;
      }
      const copy = { ...prev };
      delete copy[filename];
      return copy;
    });

    setRetrievalByFile((prev) => {
      if (!(filename in prev)) {
        return prev;
      }
      const copy = { ...prev };
      delete copy[filename];
      return copy;
    });
  }

  async function handleDelete(filename: string) {
    const confirmed = window.confirm(`Delete \"${filename}\"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setError("");
    setStatus("Deleting");
    setOpenMenuFor(null);

    try {
      await deleteSummary(filename);
      removePerFileState(filename);
      await loadSummaries(filename === selectedFile ? undefined : selectedFile);
      if (filename === selectedFile) {
        setSelectedFile("");
      }
      setStatus("Deleted");
    } catch (err) {
      setStatus("");
      setError(toUserError(err, "Delete failed"));
    }
  }

  function openRenameDialog(filename: string) {
    setRenameTarget(filename);
    setRenameValue(filename);
    setOpenMenuFor(null);
    setError("");
  }

  async function handleRename() {
    if (!renameTarget) {
      return;
    }

    const raw = renameValue.trim();
    if (!raw) {
      setError("Enter a new name.");
      return;
    }

    const ext = extensionOf(renameTarget);
    const composed = raw.includes(".") ? raw : `${raw}${ext}`;

    setError("");
    setStatus("Renaming");

    try {
      const oldName = renameTarget;
      const newName = await renameSummary(renameTarget, composed);
      movePerFileState(oldName, newName);
      await loadSummaries(newName);
      setRenameTarget(null);
      setRenameValue("");
      setStatus(`Renamed to ${newName}`);
    } catch (err) {
      setStatus("");
      setError(toUserError(err, "Rename failed"));
    }
  }

  async function handleBuildIndex() {
    if (!selectedFile) {
      setError("Select a recording first.");
      return;
    }

    setError("");
    setStatus("Building retrieval index");

    try {
      const chunks = await indexSummary(selectedFile);
      setStatus(`Index built with ${chunks} chunks`);
    } catch (err) {
      setStatus("");
      setError(toUserError(err, "Indexing failed"));
    }
  }

  async function handleAsk() {
    if (!selectedFile) {
      setError("Select a recording first.");
      return;
    }

    const question = (questionsByFile[selectedFile] || "").trim();
    if (!question) {
      setError("Type a question first.");
      return;
    }

    setError("");
    setIsAnswering(true);

    try {
      const useRetrieval = retrievalByFile[selectedFile] || false;
      const answer = useRetrieval
        ? await retrieveAsk(selectedFile, question)
        : await askSummary(selectedFile, question);

      setHistoryByFile((prev) => {
        const existing = prev[selectedFile] || [];
        return {
          ...prev,
          [selectedFile]: [
            ...existing,
            {
              question,
              answer,
              mode: useRetrieval ? "retrieval" : "direct",
              createdAt: Date.now(),
            },
          ],
        };
      });

      setQuestionsByFile((prev) => ({ ...prev, [selectedFile]: "" }));
    } catch (err) {
      setError(toUserError(err, "Failed to get answer"));
    } finally {
      setIsAnswering(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Recordings sidebar">
        <header className="brand-wrap">
          <p className="eyebrow">Learning Workspace</p>
          <h1>EduSummarizer</h1>
        </header>

        <button type="button" className="btn btn-primary" onClick={() => setSelectedFile("")}>
          New Prompt
        </button>

        <section className="panel recordings-panel">
          <h2>Recordings</h2>
          {summaries.length === 0 ? (
            <p className="muted">No recordings yet.</p>
          ) : (
            <ul className="recording-list" aria-label="Saved recordings">
              {summaries.map((item) => (
                <li key={item.filename}>
                  <div className={`recording-row ${item.filename === selectedFile ? "active" : ""}`}>
                    <button
                      type="button"
                      className="recording-main"
                      onClick={() => {
                        setSelectedFile(item.filename);
                        setOpenMenuFor(null);
                      }}
                      aria-current={item.filename === selectedFile ? "true" : undefined}
                    >
                      <span className="name">{item.filename}</span>
                      <span className="meta">{formatDate(item.updated_at || item.created_at)}</span>
                    </button>

                    <div className="menu-wrap">
                      <button
                        type="button"
                        className="menu-btn"
                        aria-label={`Open actions for ${item.filename}`}
                        onClick={() => setOpenMenuFor((prev) => (prev === item.filename ? null : item.filename))}
                      >
                        ⋯
                      </button>

                      {openMenuFor === item.filename && (
                        <div className="menu-popover" role="menu">
                          <button type="button" role="menuitem" onClick={() => openRenameDialog(item.filename)}>
                            Rename
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="menu-danger"
                            onClick={() => handleDelete(item.filename)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <section className="content" aria-label="Recording context">
        {!selectedSummary ? (
          <section className="welcome-card">
            <p className="eyebrow">EduSummarizer</p>
            <h2>Hi, what can I help you summarize today?</h2>
            <p className="welcome-subtext">
              Start by uploading audio or recording directly. Once processed, you can open it from the left sidebar.
            </p>

            <form onSubmit={handleUpload} className="stack">
              <label htmlFor="audio">Choose audio file</label>
              <input
                ref={fileInputRef}
                id="audio"
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const selected = e.target.files?.[0] || null;
                  setFile(selected);
                  setUploadName(selected ? stripExtension(selected.name) : "");
                }}
              />

              {file && (
                <div className="selected-file-chip selected-file-chip-main" role="status" aria-live="polite">
                  <span className="file-name">{file.name}</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-main"
                    onClick={clearSelectedUpload}
                    aria-label="Clear selected audio file"
                  >
                    ×
                  </button>
                </div>
              )}

              <label htmlFor="upload-name">Recording name</label>
              <input
                id="upload-name"
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Example: Physics class free vibrations"
              />

              <div className="row">
                <button type="submit" className="btn btn-primary">
                  Transcribe and summarize
                </button>
              </div>
            </form>

            <div className="recorder-card recorder-card-main">
              <div className="recorder-top-row">
                <h3>Record Audio</h3>
                <div className={`recording-indicator ${isRecording ? "active" : ""}`}>
                  <span className="dot" />
                  <span>{isRecording ? `Recording ${formatElapsed(recordingSeconds)}` : "Not recording"}</span>
                </div>
              </div>

              <div className="recorder-actions">
                <button type="button" className="btn" onClick={handleStartRecording} disabled={isRecording}>
                  Start
                </button>
                <button type="button" className="btn" onClick={handleStopRecording} disabled={!isRecording}>
                  Stop
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleUseRecording}
                  disabled={!recordingBlob || isRecording}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleCancelRecording}
                  disabled={!isRecording && !recordingBlob}
                >
                  Cancel
                </button>
              </div>

              {recordingUrl && <audio controls src={recordingUrl} className="audio-preview" />}
            </div>
          </section>
        ) : (
          <>
            <header className="content-header">
              <div>
                <p className="eyebrow">Current recording</p>
                <h2>{selectedSummary.filename}</h2>
              </div>
              <span className="pill">{formatDate(selectedSummary.updated_at || selectedSummary.created_at)}</span>
            </header>

            <article className="context-card">
              <h3>Summary Context</h3>
              <FormattedText text={selectedSummary.summary} />
              {selectedSummary.transcription && (
                <details>
                  <summary>View transcription</summary>
                  <FormattedText text={selectedSummary.transcription} />
                </details>
              )}
            </article>

            <section className="context-card">
              <h3>Chat About This Recording</h3>
              <div className="chat-log" aria-live="polite" ref={chatLogRef}>
                {currentHistory.length === 0 ? (
                  <p className="empty-chat">No questions for this recording yet.</p>
                ) : (
                  currentHistory.map((entry) => (
                    <article key={entry.createdAt} className="chat-item">
                      <p className="chat-question">Q: {entry.question}</p>
                      <div className="chat-answer">
                        <span className="answer-label">A:</span>
                        <FormattedText text={entry.answer} />
                      </div>
                      <p className="chat-meta">Mode: {entry.mode}</p>
                    </article>
                  ))
                )}
                {isAnswering && <p className="chat-meta">Generating answer...</p>}
              </div>

              <label htmlFor="question">Your question</label>
              <textarea
                id="question"
                rows={4}
                value={currentQuestion}
                onChange={(e) => {
                  if (!selectedFile) {
                    return;
                  }
                  setQuestionsByFile((prev) => ({ ...prev, [selectedFile]: e.target.value }));
                }}
                placeholder="Ask only about this recording"
              />

              <div className="toggle-row">
                <input
                  id="retrieval-mode"
                  type="checkbox"
                  checked={currentUseRetrieval}
                  onChange={(e) => {
                    if (!selectedFile) {
                      return;
                    }
                    setRetrievalByFile((prev) => ({ ...prev, [selectedFile]: e.target.checked }));
                  }}
                />
                <label htmlFor="retrieval-mode">Use retrieval mode</label>
              </div>

              <div className="row">
                <button type="button" className="btn" onClick={handleBuildIndex}>
                  Build retrieval index
                </button>
                <button type="button" className="btn btn-primary" onClick={handleAsk} disabled={isAnswering}>
                  {isAnswering ? "Getting answer..." : "Get answer"}
                </button>
              </div>
            </section>
          </>
        )}
      </section>

      {(status || error) && (
        <div className="toast-stack" aria-live="polite">
          {status && <p className="status">{status}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {renameTarget && (
        <div className="modal-backdrop" onClick={() => setRenameTarget(null)}>
          <div
            className="rename-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rename-title">Rename recording</h3>
            <label htmlFor="rename-input">New name</label>
            <input
              id="rename-input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={handleRename}>
                Save
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setRenameTarget(null);
                  setRenameValue("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
