import type { OrgChartNode } from "@fleet/types";

type Props = {
  node: OrgChartNode;
  depth?: number;
};

export function OrgChartTree({ node, depth = 0 }: Props) {
  const pad = depth * 16;
  return (
    <div className="text-sm">
      <div
        className={`rounded-md border px-3 py-2 ${
          node.isSelf
            ? "border-emerald-600 bg-emerald-950/40 text-white"
            : "border-slate-700 bg-slate-900/60 text-slate-200"
        }`}
        style={{ marginLeft: pad }}
      >
        <div className="font-medium">{node.label}</div>
        <div className="text-xs text-slate-400">
          {node.kind === "tenant" && "Organization"}
          {node.kind === "location" && "Location"}
          {node.kind === "user" && (node.role ?? "User")}
          {node.locationName ? ` · ${node.locationName}` : ""}
          {node.isSelf ? " · You" : ""}
        </div>
      </div>
      {node.children?.map((child) => (
        <div key={child.nodeId} className="mt-2">
          <OrgChartTree node={child} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}
