"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import type { Capabilities } from "@/lib/contract";
import { defaultLimits, validateFiles, validateImages } from "@/lib/files";

export default function FileDrop({
  files,
  onChange,
  multiple = false,
  disabled = false,
  limits = defaultLimits,
  label,
  canvas = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  limits?: Capabilities["limits"];
  label: string;
  canvas?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const revision = useRef(0);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);
  async function receive(incoming: File[]) {
    if (disabled) return;
    const current = ++revision.current;
    const next = multiple ? [...files, ...incoming] : incoming;
    const issue =
      !multiple && incoming.length !== 1
        ? "Choose one image for each inspection."
        : validateFiles(next, limits);
    if (issue) {
      setError(issue);
      return;
    }
    try {
      await validateImages(incoming);
      if (current === revision.current) {
        setError("");
        onChange(next);
      }
    } catch (e) {
      if (current === revision.current) setError((e as Error).message);
    }
  }
  return (
    <div
      className={`file-field ${canvas ? "canvas-upload" : ""} ${files.length ? "has-files" : ""}`}
    >
      <input
        ref={input}
        id={id}
        className="sr-only"
        type="file"
        accept={limits.allowed_mime_types.join(",")}
        multiple={multiple}
        disabled={disabled}
        aria-label={label}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        onChange={(e) => {
          void receive(Array.from(e.currentTarget.files ?? []));
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className={`dropzone ${dragging ? "dragging" : ""} ${files.length ? "compact" : ""}`}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void receive(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="upload-icon">
          {files.length ? <ImagePlus size={22} /> : <Upload size={24} />}
        </span>
        <strong>
          {files.length
            ? multiple
              ? "Add more images"
              : "Replace image"
            : multiple
              ? "Upload reference samples"
              : "Upload a part image"}
        </strong>
        <span>
          or <u>browse files</u>
        </span>
        <small id={`${id}-hint`}>
          {limits.allowed_mime_types
            .map((t) => t.split("/")[1].toUpperCase())
            .join(", ")}{" "}
          · up to {Math.floor(limits.max_file_bytes / 1024 / 1024)} MB each
          {multiple ? ` · max ${limits.max_files}` : ""}
        </small>
      </button>
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <div className={`previews ${multiple ? "" : "single"}`}>
          {files.map((file, i) => (
            <div
              className="preview"
              key={`${file.name}-${file.lastModified}-${i}`}
            >
              {previews[i] && (
                <img src={previews[i]} alt={`Preview: ${file.name}`} />
              )}
              <span title={file.name}>{file.name}</span>
              <button
                type="button"
                className="icon-button remove"
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  revision.current++;
                  onChange(files.filter((_, index) => index !== i));
                  setError("");
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
