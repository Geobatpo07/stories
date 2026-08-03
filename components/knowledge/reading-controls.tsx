"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const article = document.querySelector<HTMLElement>(".reading-layout article");
      const start = article ? article.getBoundingClientRect().top + window.scrollY : 0;
      const end = article
        ? start + article.offsetHeight - window.innerHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      setProgress(
        end > start
          ? Math.min(100, Math.max(0, ((window.scrollY - start) / (end - start)) * 100))
          : 100,
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div
      className="reading-progress"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <span style={{ transform: `scaleX(${progress / 100})` }} />
    </div>
  );
}

export function CopyCode({ code, language }: Readonly<{ code: string; language?: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language || "Code"}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Copied" : "Copy"}
          <span className="sr-only"> code to clipboard</span>
        </button>
      </div>
      <pre tabIndex={0} aria-label={`${language || "Code"} block`}>
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    </div>
  );
}

export function ZoomableFigure({
  src,
  alt,
  caption,
}: Readonly<{ src: string; alt: string; caption?: string }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <figure className="research-figure">
      <button
        className="figure-zoom-trigger"
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Enlarge figure: ${alt}`}
      >
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          sizes="(max-width: 900px) 100vw, 780px"
        />
      </button>
      {caption && <figcaption>{caption}</figcaption>}
      <dialog
        className="figure-dialog"
        ref={dialog}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Close enlarged figure"
        >
          Close
        </button>
        <Image src={src} alt={alt} width={2000} height={1400} sizes="100vw" />
        <p>{caption ?? alt}</p>
      </dialog>
    </figure>
  );
}
