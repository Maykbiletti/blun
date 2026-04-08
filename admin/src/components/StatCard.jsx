export default function StatCard({ label, value, sub, trend }) {
  const trendColor = trend === 'up'
    ? 'text-blun-green'
    : trend === 'down'
      ? 'text-blun-red'
      : 'text-blun-fg3';

  return (
    <div className="bg-blun-card border border-blun-border rounded-blun-lg p-5 hover:border-blun-fg3/30 transition-colors">
      <p className="text-[11px] uppercase tracking-wider text-blun-fg3 mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && (
        <p className={`text-xs mt-1 ${trendColor}`}>{sub}</p>
      )}
    </div>
  );
}
