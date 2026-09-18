import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Employee, EmployeePersona } from "@fleet/types";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { ApiError } from "@fleet/api-client";
import { BULK_CREATE_USERS_LIMIT } from "@/lib/employeePlatformUser";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  persona: EmployeePersona;
  title: string;
  candidates: Employee[];
};

type RowResult = { employeeId: string; name: string; ok: boolean; message?: string };

export function BulkCreateUsersModal({
  open,
  onClose,
  tenantId,
  persona,
  title,
  candidates,
}: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<RowResult[] | null>(null);

  function resetAndClose() {
    setSelected(new Set());
    setResults(null);
    onClose();
  }

  const run = useMutation({
    mutationFn: async (ids: string[]) => {
      const out: RowResult[] = [];
      for (const employeeId of ids) {
        const emp = candidates.find((c) => c.employeeId === employeeId);
        try {
          await api.createUserFromEmployee(employeeId, tenantId);
          out.push({
            employeeId,
            name: emp?.name ?? employeeId,
            ok: true,
          });
        } catch (err) {
          let message = "Failed";
          if (err instanceof ApiError) {
            if (
              typeof err.body === "object" &&
              err.body &&
              "detail" in err.body
            ) {
              message = String((err.body as { detail: unknown }).detail);
            } else {
              message = err.message;
            }
          }
          out.push({
            employeeId,
            name: emp?.name ?? employeeId,
            ok: false,
            message,
          });
        }
      }
      return out;
    },
    onSuccess: (out) => {
      setResults(out);
      qc.invalidateQueries({ queryKey: ["employees", tenantId] });
      qc.invalidateQueries({ queryKey: ["users", tenantId] });
    },
  });

  if (!open) {
    return null;
  }

  function toggle(id: string, canSelect: boolean) {
    if (!canSelect) {
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < BULK_CREATE_USERS_LIMIT) {
        next.add(id);
      }
      return next;
    });
  }

  const eligible = candidates.filter((c) => Boolean(c.email?.trim()));
  const missingEmail = candidates.filter((c) => !c.email?.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Create platform users</h2>
            <p className="mt-1 text-sm text-slate-400">
              Select employees with persona <strong className="text-slate-300">{persona}</strong>{" "}
              who are not users yet. Each gets a Cognito account in the matching group.
            </p>
            <p className="mt-2 text-xs text-amber-200/90">
              Limit: up to {BULK_CREATE_USERS_LIMIT} users per batch (Cognito and invite
              safety).
            </p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {eligible.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            No {title.toLowerCase()} employees waiting for a user account
            {missingEmail.length > 0
              ? ` (${missingEmail.length} missing email — add email on employee profile first).`
              : "."}
          </p>
        ) : (
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-800 p-2">
            {eligible.map((emp) => {
              const checked = selected.has(emp.employeeId);
              const atLimit = selected.size >= BULK_CREATE_USERS_LIMIT && !checked;
              return (
                <li key={emp.employeeId}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-900/80 ${
                      atLimit ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atLimit}
                      onChange={() => toggle(emp.employeeId, !atLimit)}
                      className="h-4 w-4 rounded border-slate-600"
                    />
                    <span className="flex-1 text-sm text-slate-200">
                      {emp.name}
                      <span className="ml-2 text-slate-500">{emp.employeeCode ?? ""}</span>
                    </span>
                    <span className="truncate text-xs text-slate-500">{emp.email}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {missingEmail.length > 0 && eligible.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {missingEmail.length} employee(s) skipped — email required before creating a user.
          </p>
        )}

        {results && (
          <ul className="mt-4 space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.employeeId} className={r.ok ? "text-emerald-400" : "text-red-400"}>
                {r.name}: {r.ok ? "User created" : r.message}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            Selected {selected.size} / {BULK_CREATE_USERS_LIMIT}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
            >
              {results ? "Done" : "Cancel"}
            </button>
            {!results && (
              <button
                type="button"
                disabled={selected.size === 0 || run.isPending}
                onClick={() => run.mutate([...selected])}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {run.isPending
                  ? "Creating…"
                  : `Create user${selected.size > 1 ? "s" : ""} (${selected.size})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
