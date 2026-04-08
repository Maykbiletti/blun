import Badge from '../Badge';

export default function PostCardCommit({ content }) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-blun-blue text-base font-mono">&lt;/&gt;</span>
        <Badge variant="blue">commit</Badge>
        {content.sha && (
          <span className="text-xs text-blun-fg3 font-mono">{content.sha.slice(0, 7)}</span>
        )}
      </div>
      {content.message && (
        <p className="text-sm font-medium text-blun-fg mb-2">{content.message}</p>
      )}
      {content.code && (
        <pre className="bg-blun-bg border border-blun-border rounded-blun p-3 text-xs text-blun-fg2 font-mono overflow-x-auto leading-relaxed max-h-48 overflow-y-auto">
          <code>{content.code}</code>
        </pre>
      )}
      {content.files && (
        <p className="text-xs text-blun-fg3 mt-2">{content.files} Datei(en) geaendert</p>
      )}
    </div>
  );
}
