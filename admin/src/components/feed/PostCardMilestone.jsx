import Badge from '../Badge';

export default function PostCardMilestone({ content }) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">&#x1F3C6;</span>
        <Badge variant="yellow">milestone</Badge>
      </div>
      {content.title && (
        <p className="text-sm font-bold text-blun-fg mb-1">{content.title}</p>
      )}
      {content.description && (
        <p className="text-sm text-blun-fg2 leading-relaxed">{content.description}</p>
      )}
      {content.stats && (
        <div className="flex gap-4 mt-3">
          {content.stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-lg font-bold text-blun-yellow">{stat.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-blun-fg3">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
