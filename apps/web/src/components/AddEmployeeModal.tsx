import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EMPLOYEE_PERSONAS } from "@fleet/constants";
import { createEmployeeSchema } from "@fleet/validation";
import { useRef, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { ApiError } from "@fleet/api-client";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";

type Props = {
  open: boolean;
  tenantId: string;
  onClose: () => void;
};

export function AddEmployeeModal({ open, tenantId, onClose }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [email, setEmail] = useState("");
  const [persona, setPersona] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setEmployeeCode("");
    setEmail("");
    setPersona("");
    setFormError(null);
    setImportMessage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createEmployee>[0]) => api.createEmployee(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", tenantId] });
      handleClose();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Could not create employee");
    },
  });

  const importExcel = useMutation({
    mutationFn: (file: File) => api.importEmployeesFromExcel(file, tenantId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["employees", tenantId] });
      setImportMessage(
        `Imported ${result.created} employee(s).` +
          (result.failed ? ` ${result.failed} row(s) had errors.` : ""),
      );
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: () => {
      setImportMessage("Upload failed. Check the file format and try again.");
    },
  });

  async function handleDownloadTemplate() {
    setImportMessage(null);
    try {
      const blob = await api.downloadEmployeeImportTemplate(tenantId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "employee-import-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setImportMessage("Could not download template.");
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createEmployeeSchema.safeParse({
      name,
      employeeCode: employeeCode || undefined,
      email: email || undefined,
      persona: persona || undefined,
      tenantId,
    });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Add employee</h2>
            <p className="mt-1 text-sm text-slate-400">
              Create manually or import from Excel for this tenant.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Excel import
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadTemplate()}
              className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Download template
            </button>
            <label className="cursor-pointer rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30">
              {importExcel.isPending ? "Uploading…" : "Upload Excel"}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importExcel.mutate(file);
                }}
              />
            </label>
          </div>
          {importMessage && (
            <p className="mt-3 text-sm text-slate-300">{importMessage}</p>
          )}
          {importExcel.data?.errors?.length ? (
            <ul className="mt-2 list-inside list-disc text-sm text-amber-400/90">
              {importExcel.data.errors.slice(0, 5).map((err) => (
                <li key={`${err.row}-${err.message}`}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <form onSubmit={handleCreate} className="mt-6 grid gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1 ${inputClass}`}
              required
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
              <span className="text-xs text-slate-400">Persona</span>
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Select persona</option>
                {EMPLOYEE_PERSONAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-400">Email (for Create user later)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
            >
              {create.isPending ? "Saving…" : "Save employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
