import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Employee } from "@fleet/types";
import { EMPLOYEE_PERSONAS, EMPLOYEE_STATUSES } from "@fleet/constants";
import { updateEmployeeSchema } from "@fleet/validation";
import { useEffect, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { ApiError } from "@fleet/api-client";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";

type Props = {
  open: boolean;
  employee: Employee;
  tenantId: string;
  onClose: () => void;
};

export function EditEmployeeModal({ open, employee, tenantId, onClose }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const [name, setName] = useState(employee.name);
  const [employeeCode, setEmployeeCode] = useState(employee.employeeCode ?? "");
  const [email, setEmail] = useState(employee.email ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [persona, setPersona] = useState(employee.persona ?? "");
  const [status, setStatus] = useState(employee.status);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(employee.name);
      setEmployeeCode(employee.employeeCode ?? "");
      setEmail(employee.email ?? "");
      setPhone(employee.phone ?? "");
      setPersona(employee.persona ?? "");
      setStatus(employee.status);
      setError(null);
    }
  }, [open, employee]);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.updateEmployee>[1]) =>
      api.updateEmployee(employee.employeeId, body, tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee", employee.employeeId] });
      qc.invalidateQueries({ queryKey: ["employees", tenantId] });
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
    const parsed = updateEmployeeSchema.safeParse({
      name,
      employeeCode: employeeCode || undefined,
      email: email || undefined,
      phone: phone || undefined,
      persona: persona || undefined,
      status,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white">Edit employee</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-slate-400">Employee ID</span>
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Employee["status"])}
                className={`mt-1 ${inputClass}`}
              >
                {EMPLOYEE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-400">Persona</span>
            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">None</option>
              {EMPLOYEE_PERSONAS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
