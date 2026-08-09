"use client";

import { useEffect, useState } from "react";

type Post = {
  id: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: {
    title: string;
    url: string;
    sourceName: string;
  }[];
  title?: string | null;
  whySelected?: string | null;
  whyNow?: string | null;
};

type Agent = {
  agentId: string;
};

type RunResult = {
  runId: string;
  agentId: string;
  status: string;
  discovered: number;
  rejected: number;
  held: number;
  published: number;
  selectedTitle?: string;
};

export default function Home() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function initializeAgent() {
    setInitializing(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          persona: {
            name: "Sigma",
            domain: "AI and Technology",
          },
        }),
      });

      const data: Agent = await response.json();

      if (!response.ok) {
        throw new Error("Failed to initialize Sigma");
      }

      setAgentId(data.agentId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to initialize agent",
      );
    } finally {
      setInitializing(false);
    }
  }

  async function loadFeed(id: string) {
    try {
      const response = await fetch(
        `/api/agent/feed?agentId=${id}`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error("Failed to load feed");
      }

      setPosts(data.posts ?? []);
setRun(data.latestRun ?? null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load feed",
      );
    }
  }

  async function runAgent() {
    if (!agentId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId,
        }),
      });

      const data: RunResult = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data === "object" && "status" in data
            ? "Agent run failed"
            : "Agent run failed",
        );
      }

      setRun(data);

      await loadFeed(agentId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Agent run failed",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedAgentId = window.localStorage.getItem(
      "sigma-agent-id",
    );

    if (storedAgentId) {
      setAgentId(storedAgentId);
      loadFeed(storedAgentId);
    }
  }, []);

  useEffect(() => {
    if (agentId) {
      window.localStorage.setItem(
        "sigma-agent-id",
        agentId,
      );
    }
  }, [agentId]);

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black font-bold">
                Σ
              </div>

              <div>
                <h1 className="text-xl font-semibold">
                  Sigma AI
                </h1>

                <p className="text-sm text-white/45">
                  Autonomous technology intelligence
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-sm text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Active
            </div>

            {!agentId ? (
              <button
                onClick={initializeAgent}
                disabled={initializing}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
              >
                {initializing
                  ? "Initializing..."
                  : "Initialize Sigma"}
              </button>
            ) : (
              <button
                onClick={runAgent}
                disabled={loading}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
              >
                {loading
                  ? "Sigma is thinking..."
                  : "Run Sigma"}
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Discovered"
            value={run?.discovered ?? "—"}
          />
          <Stat
            label="Held"
            value={run?.held ?? "—"}
          />
          <Stat
            label="Rejected"
            value={run?.rejected ?? "—"}
          />
          <Stat
            label="Published"
            value={run?.published ?? "—"}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">
                  Intelligence Feed
                </p>

                <h2 className="mt-1 text-2xl font-semibold">
                  What Sigma decided to publish
                </h2>
              </div>

              {run?.selectedTitle && (
                <span className="hidden text-xs text-white/35 sm:block">
                  Latest cycle completed
                </span>
              )}
            </div>

            {posts.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
                <p className="text-white/55">
                  No published intelligence yet.
                </p>

                <p className="mt-2 text-sm text-white/30">
                  Initialize Sigma and run the agent.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {posts.map((post) => (
                  <article
                    key={post.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-white/40">
                      <span className="rounded-full border border-white/10 px-2.5 py-1">
                        {post.sources?.[0]?.sourceName ??
                          "Unknown source"}
                      </span>

                      <span>
                        {new Date(
                          post.createdAt,
                        ).toLocaleString()}
                      </span>
                    </div>

                    <h3 className="text-xl font-semibold leading-snug">
                      {post.title ?? "Untitled topic"}
                    </h3>

                    <p className="mt-4 leading-7 text-white/65">
                      {post.text}
                    </p>

                    {post.whySelected && (
                      <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-white/35">
                          Why selected
                        </p>

                        <p className="mt-2 text-sm leading-6 text-white/55">
                          {post.whySelected}
                        </p>
                      </div>
                    )}

                    {post.whyNow && (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-white/35">
                          Why now
                        </p>

                        <p className="mt-2 text-sm leading-6 text-white/55">
                          {post.whyNow}
                        </p>
                      </div>
                    )}

                    {post.sources?.[0]?.url && (
                      <a
                        href={post.sources[0].url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 inline-block text-sm text-white underline decoration-white/20 underline-offset-4 hover:decoration-white/60"
                      >
                        View source
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <Panel title="Agent">
              <div className="space-y-4">
                <Info label="Name" value="Sigma" />
                <Info
                  label="Domain"
                  value="AI and Technology"
                />
                <Info
                  label="Status"
                  value={agentId ? "ACTIVE" : "NOT INITIALIZED"}
                />
              </div>
            </Panel>

            <Panel title="Latest cycle">
              {run ? (
                <div className="space-y-4">
                  <Info
                    label="Status"
                    value={run.status}
                  />

                  <Info
                    label="Selected"
                    value={
                      run.selectedTitle ??
                      "Nothing published"
                    }
                  />

                  <Info
                    label="Run ID"
                    value={run.runId}
                  />
                </div>
              ) : (
                <p className="text-sm leading-6 text-white/35">
                  Run Sigma to see the latest autonomous
                  decision cycle.
                </p>
              )}
            </Panel>

            <Panel title="Autonomy pipeline">
              <div className="space-y-2">
                {[
                  "Discovery",
                  "Deduplication",
                  "Material delta",
                  "Editorial scoring",
                  "Selection",
                  "Evidence check",
                  "Generation",
                  "Memory",
                  "Publication",
                ].map((stage, index) => (
                  <div
                    key={stage}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-white/50">
                      {index + 1}
                    </span>

                    <span className="text-white/55">
                      {stage}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs uppercase tracking-wider text-white/35">
        {label}
      </p>

      <p className="mt-2 text-3xl font-semibold">
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-5 text-sm font-medium">
        {title}
      </h3>

      {children}
    </section>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-white/30">
        {label}
      </p>

      <p className="mt-1 break-words text-sm text-white/65">
        {value}
      </p>
    </div>
  );
}