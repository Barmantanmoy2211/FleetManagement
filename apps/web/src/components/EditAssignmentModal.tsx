import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Assignment } from "@fleet/types";
import { updateAssignmentSchema } from "@fleet/validation";
import { useEffect, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { ApiError } from "@fleet/api-client";
import {
  assignmentChangeDate,
  assignmentReleaseDate,
} from "@/lib/assignmentDates";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";

type Props = {
  open: boolean;
  assignment: Assignment;
  tenantId: string;
  onClose: () => void;
};

export function EditAssignmentModal({ open, assignment, tenantId, onClose }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const canEditChange = assignment.status === "SCHEDULED";
  const [changeDate, setChangeDate] = useState(
    assignmentChangeDate(assignment) ?? "",
  );
  const [releaseDate, setReleaseDate] = useState(
    assignmentReleaseDate(assignment) ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setChangeDate(assignmentChangeDate(assignment) ?? "");
      setReleaseDate(assignmentReleaseDate(assignment) ?? "");
      setError(null);
    }
  }, [open, assignment]);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.updateAssignment>[1]) =>
      api.updateAssignment(assignment.assignmentId, body, tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignment", assignment.assignmentId] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Update failed");
    },
  });

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = updateAssignmentSchema.safeParse({
      changeDate: canEditChange && changeDate ? changeDate : undefined,
      releaseDate: releaseDate || null,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white">Edit assignment</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          {canEditChange ? (
            <label className="block">
              <span className="text-xs text-slate-400">Date of change</span>
              <input
                type="date"
                value={changeDate}
                onChange={(e) => setChangeDate(e.target.value)}
                className={`mt-1 ${inputClass}`}
                required
              />
            </label>
          ) : (
            <p className="text-sm text-slate-500">
              Change date: {assignmentChangeDate(assignment) ?? "—"} (not editable
              while active)
            </p>
          )}
          <label className="block">
            <span className="text-xs text-slate-400">Date of release (tentative)</span>
            <input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
