export default function DataTable({ columns, data, onRowClick }) {
  return (
    <div className="bg-blun-card border border-blun-border rounded-blun-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left text-[11px] uppercase tracking-wider text-blun-fg3 px-4 py-3 border-b border-blun-border font-medium"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-blun-border last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-white/[.02]' : ''
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm text-blun-fg2">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-blun-fg3"
                >
                  Keine Daten vorhanden
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
