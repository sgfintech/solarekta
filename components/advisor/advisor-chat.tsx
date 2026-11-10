"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { askAdvisorAction, clearAdvisorThreadAction } from "@/app/actions/advisor";
import { AdvisorBlocks } from "@/components/advisor/result-cards";
import { Alert, ArrowRight, SunIcon } from "@/components/icons";
import type { AdvisorAnswer } from "@/lib/advisor/view";

const PLACEHOLDER = "Ask about solar equipment, prices, or your quotation…";

export function AdvisorChat({
  initialTurns,
  initialThreadId,
  examples,
  autoAsk,
  signedIn,
  aiEnabled,
  inDashboard = false,
}: {
  initialTurns: AdvisorAnswer[];
  initialThreadId: string | null;
  examples: string[];
  autoAsk?: { question: string; productId?: string; quoteReviewId?: string } | null;
  signedIn: boolean;
  aiEnabled: boolean;
  inDashboard?: boolean;
}) {
  const [turns, setTurns] = useState<AdvisorAnswer[]>(initialTurns);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);

  const ask = (text: string, productId?: string, quoteReviewId?: string) => {
    const q = text.trim();
    if (q.length < 3 || pending) return;
    setError(null);
    setPendingQuestion(q);
    setQuestion("");
    startTransition(async () => {
      const result = await askAdvisorAction({ question: q, threadId, productId: productId ?? null, quoteReviewId: quoteReviewId ?? null });
      setPendingQuestion(null);
      if (!result.ok) {
        setError(result.error);
        setQuestion(q);
        return;
      }
      setThreadId(result.answer.threadId);
      setTurns((prev) => [...prev, result.answer]);
    });
  };

  useEffect(() => {
    if (autoAsk && !asked.current) {
      asked.current = true;
      ask(autoAsk.question, autoAsk.productId, autoAsk.quoteReviewId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (turns.length || pendingQuestion) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pendingQuestion]);

  const toggleCompare = (productId: string) =>
    setCompare((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : prev.length >= 3 ? [...prev.slice(1), productId] : [...prev, productId]));

  const reset = () => {
    if (threadId) void clearAdvisorThreadAction(threadId);
    setTurns([]);
    setThreadId(null);
    setCompare([]);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-5">
      {turns.length === 0 && !pendingQuestion ? (
        <div className="card card-pad">
          <p className="text-sm font-semibold text-forest-deep">Try one of these</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((e) => (
              <button key={e} type="button" onClick={() => ask(e)} className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-sm text-forest-deep transition hover:border-forest">
                {e}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Prices come from verified supplier listings{aiEnabled ? "; AI only reads your question and phrases the summary" : ""}. Capacity is calculated, never guessed. Nothing is sent to a supplier unless you choose to.
          </p>
        </div>
      ) : null}

      <ol className="space-y-6" aria-live="polite">
        {turns.map((turn) => (
          <li key={turn.turnId} className="space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-forest px-4 py-2 text-sm text-white">{turn.question}</p>
            <div className="card card-pad space-y-4">
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint text-forest"><SunIcon className="h-4 w-4" /></span>
                <div>
                  <p className="text-sm text-ink">{turn.summary}</p>
                  <p className="mt-1 text-xs text-muted">{turn.summarySource === "ai" ? "Summary written by AI from the results below" : "Summary generated from the results below"}</p>
                </div>
              </div>
              {turn.notices.map((n) => <p key={n} className="rounded-xl bg-paper px-3 py-2 text-xs text-ink-soft">{n}</p>)}
              <AdvisorBlocks blocks={turn.blocks} compare={{ selected: compare, toggle: toggleCompare }} onSuggest={(s) => ask(s)} />
            </div>
          </li>
        ))}
        {pendingQuestion ? (
          <li className="space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-forest px-4 py-2 text-sm text-white">{pendingQuestion}</p>
            <div className="card card-pad flex items-center gap-3 text-sm text-ink-soft">
              <span className="spinner" aria-hidden="true" /> Checking verified listings…
            </div>
          </li>
        ) : null}
      </ol>
      <div ref={endRef} />

      {compare.length ? (
        <div className={`sticky z-10 flex flex-wrap items-center justify-between ${inDashboard ? "bottom-44 lg:bottom-24" : "bottom-24"} gap-2 rounded-2xl border border-forest bg-white px-4 py-3 shadow-lg`}>
          <p className="text-sm text-ink">{compare.length} selected to compare{compare.length < 2 ? " (pick at least 2)" : ""}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompare([])}>Clear</button>
            {compare.length >= 2 ? <Link href={`/advisor/compare?ids=${compare.join(",")}`} className="btn btn-primary btn-sm">Compare products <ArrowRight /></Link> : null}
          </div>
        </div>
      ) : null}

      <form
        className={`sticky z-10 rounded-2xl border border-line bg-white p-3 shadow-lg ${inDashboard ? "bottom-24 lg:bottom-3" : "bottom-3"}`}
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        {error ? (
          <p role="alert" className="alert-error mb-2 flex gap-2">
            <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        ) : null}
        <label htmlFor="advisor-question" className="sr-only">Your question</label>
        <div className="flex items-end gap-2">
          <textarea
            id="advisor-question"
            ref={inputRef}
            rows={1}
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            placeholder={PLACEHOLDER}
            className="textarea min-h-[46px] flex-1 resize-none"
          />
          <button type="submit" className="btn btn-primary" disabled={pending || question.trim().length < 3}>
            {pending ? "Checking…" : "Ask"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{turns.length ? "Ask a follow-up — I’ll remember the products above." : signedIn ? "Your questions are saved for 30 days so you can follow up." : "Guests can ask a few questions a day. Log in for more and to review a quotation."}</span>
          {turns.length ? <button type="button" className="link-action" onClick={reset}>New conversation</button> : null}
        </div>
      </form>
    </div>
  );
}
