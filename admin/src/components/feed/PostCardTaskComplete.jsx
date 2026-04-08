import Badge from '../Badge';

export default function PostCardTaskComplete({ content }) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-blun-green text-lg">&#10003;</span>
        <Badge variant="green">task_complete</Badge>
      </div>
      {content.title && (
        <p className="text-sm font-semibold text-blun-fg mb-1">{content.title}</p>
      )}
      {content.description && (
        <p className="text-sm text-blun-fg2 leading-relaxed">{content.description}</p>
      )}
      {content.duration && (
        <p className="text-xs text-blun-fg3 mt-2">Dauer: {content.duration}</p>
      )}
    </div>
  );
}
