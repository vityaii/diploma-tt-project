import { useState } from "react";
import type { ChangelogEntry, Project } from "../../api/ttApi";
import { ChangelogPanel } from "../../components/ChangelogPanel";
import { SessionControls } from "../../components/SessionControls";

type Props = {
  projects: Project[];
  loading: boolean;
  changelog: ChangelogEntry[];
  changelogLoading: boolean;
  currentUser: string;
  logoutPending?: boolean;
  onCreateProject: (input: { name: string; theme: string }) => Promise<Project | null>;
  onOpenProject: (projectId: number) => void;
  onLogout: () => void;
};

export function ProjectsPage({
  projects,
  loading,
  changelog,
  changelogLoading,
  currentUser,
  logoutPending = false,
  onCreateProject,
  onOpenProject,
  onLogout,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProjects = normalizedQuery
    ? projects.filter((project) => {
        const haystack = `${project.name} ${project.theme}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : projects;

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedTheme = theme.trim();
    if (!trimmedName) {
      setError("Enter project name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await onCreateProject({ name: trimmedName, theme: trimmedTheme });
      if (created) {
        setName("");
        setTheme("");
        setFormOpen(false);
        onOpenProject(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Projects</h1>
            <p className="mt-0.5 text-sm text-neutral-500">Choose a project or create a new one.</p>
          </div>

          <div className="flex flex-col items-stretch gap-3 lg:items-end">
            <SessionControls
              username={currentUser}
              onLogout={onLogout}
              disabled={logoutPending}
            />

            <div className="relative flex flex-wrap items-center gap-2 lg:flex-nowrap">
              <div className="relative min-w-0 flex-1 lg:w-[320px] lg:flex-none">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                >
                  <path
                    fill="currentColor"
                    d="M10 4a6 6 0 1 1 0 12a6 6 0 0 1 0-12m0-2a8 8 0 1 0 4.9 14.3l4.4 4.4a1 1 0 0 0 1.4-1.4l-4.4-4.4A8 8 0 0 0 10 2"
                  />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm outline-none shadow-sm focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                  placeholder="Search projects…"
                />
              </div>

              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChangelogOpen((current) => !current)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-neutral-500">
                    <path fill="currentColor" d="M5 5h14v2H5zm0 6h14v2H5zm0 6h10v2H5z" />
                  </svg>
                  Changelog
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    {changelog.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormOpen((v) => !v)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-3 text-sm text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-300"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-white">
                    <path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z" />
                  </svg>
                  New project
                </button>

                {changelogOpen && (
                  <div className="absolute right-0 top-full z-30 mt-3 w-[min(400px,calc(100vw-3rem))]">
                    <ChangelogPanel
                      entries={changelog}
                      loading={changelogLoading}
                      onClose={() => setChangelogOpen(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {formOpen && (
          <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-neutral-500">Project name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                  placeholder="Marketing site"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500">Theme</div>
                <input
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="mt-1 h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                  placeholder="Design system"
                />
              </div>
            </div>

            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="inline-flex h-10 items-center rounded-xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:bg-neutral-700"
              >
                {saving ? "Creating…" : "Create project"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {loading ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm md:col-span-2">
              Loading projects…
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm md:col-span-2">
              {projects.length === 0
                ? "No projects yet. Create the first one."
                : "No projects match your search."}
            </div>
          ) : (
            filteredProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpenProject(project.id)}
                className="group rounded-3xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold tracking-tight text-neutral-900">
                      {project.name}
                    </div>
                    <div className="mt-1 text-sm text-neutral-500">
                      {project.theme || "No theme"}
                    </div>
                  </div>
                  <span className="rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
                    Project
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
