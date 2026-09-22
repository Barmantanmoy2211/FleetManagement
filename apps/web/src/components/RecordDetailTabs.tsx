type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
};

export function RecordDetailTabs({ tabs, activeId, onChange }: Props) {
  if (tabs.length <= 1) {
    return null;
  }
  return (
    <div className="mt-8 flex gap-1 border-b border-slate-800">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={
              active
                ? "border-b-2 border-emerald-500 px-4 py-2 text-sm font-medium text-white"
                : "px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
