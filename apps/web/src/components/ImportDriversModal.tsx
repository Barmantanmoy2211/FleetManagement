import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DriverImportCandidate } from "@fleet/types";
import { ApiError } from "@fleet/api-client";
import { useEffect, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { loadDriverImportCandidates } from "@/lib/driverImportCandidates";

type ImportDriversModalProps = {
  open: boolean;
  tenantId?: string;
  onClose: () => void;
  onImported: (message: string) => void;
};

const EMPTY_MESSAGE =
  "No user with role Driver is available to import. Invite a driver on the Users page, or all driver users are already imported.";

export function ImportDriversModal({
  open,
  tenantId,
  onClose,
  onImported,
}: ImportDriversModalProps) {
  const api = useApiClient();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const candidates = useQuery({
    queryKey: ["driver-import-candidates", tenantId],
    queryFn: () => loadDriverImportCandidates(api, tenantId),
    enabled: open && Boolean(tenantId),
  });

  const isEmpty =
    !candidates.isLoading && !candidates.isError && (candidates.data?.length ?? 0) === 0;

  useEffect(() => {
    if (open && candidates.data && candidates.data.length > 0) {
      setSelected(new Set(candidates.data.map((c) => c.userId)));
    }
  }, [open, candidates.data]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
    }
  }, [open]);

  const importSelected = useMutation({
    mutationFn: (userIds: string[]) =>
      api.syncDriversFromUsers({
        userIds,
        tenantId,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["driver-import-candidates"] });
      onImported(
        data.created > 0
          ? `Imported ${data.created} driver profile(s).`
          : "No profiles were imported.",
      );
      onClose();
    },
  });

  if (!open) {
    return null;
  }

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function handleConfirm() {
    const userIds = [...selected];
    if (userIds.length === 0) {
      return;
    }
    importSelected.mutate(userIds);
  }

  const loadError =
    candidates.error instanceof ApiError
      ? candidates.error.status >= 500
        ? "Server error while loading users. Try again later."
        : candidates.error.status === 403
          ? "You do not have permission to import drivers."
          : "Could not load driver users. Check your connection and try again."
      : candidates.error
        ? "Failed to load users."
        : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-drivers-title"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 id="import-drivers-title" className="text-lg font-semibold text-white">
            Import driver users
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Select Users with role Driver who do not have a fleet profile yet.
          </p>
        </div>

        <div className="max-h-72 overflow-y-auto px-5 py-3">
          {candidates.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}
          {isEmpty && (
            <p className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
              {EMPTY_MESSAGE}
            </p>
          )}
          {!isEmpty && (
            <ul className="space-y-2">
              {candidates.data?.map((c: DriverImportCandidate) => (
                <li key={c.userId}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 px-3 py-2 hover:bg-slate-900/80">
                    <input
                      type="checkbox"
                      checked={selected.has(c.userId)}
                      onChange={() => toggle(c.userId)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">{c.suggestedName}</span>
                      <span className="block text-xs text-slate-500">{c.email}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {importSelected.error && (
          <p className="px-5 pb-2 text-sm text-red-400">
            {importSelected.error instanceof ApiError
              ? String(
                  typeof importSelected.error.body === "object" &&
                    importSelected.error.body &&
                    "detail" in (importSelected.error.body as object)
                    ? (importSelected.error.body as { detail: unknown }).detail
                    : importSelected.error.message,
                )
              : "Import failed."}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={importSelected.isPending}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={importSelected.isPending || isEmpty || selected.size === 0 || candidates.isLoading}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {importSelected.isPending ? "Importing…" : "Confirm import"}
          </button>
        </div>
      </div>
    </div>
  );
}
