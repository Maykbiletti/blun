import Badge from '../Badge';

export default function PostCardDeploy({ content }) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">&#x1F680;</span>
        <Badge variant="blue">deploy</Badge>
        {content.env && (
          <Badge variant={content.env === 'production' ? 'red' : 'neutral'}>{content.env}</Badge>
        )}
      </div>
      {content.service && (
        <p className="text-sm font-semibold text-blun-fg mb-1">{content.service}</p>
      )}
      {content.version && (
        <p className="text-xs text-blun-fg2">Version: <span className="font-mono">{content.version}</span></p>
      )}
      {content.description && (
        <p className="text-sm text-blun-fg2 mt-2 leading-relaxed">{content.description}</p>
      )}
      {content.status && (
        <div className="flex items-center gap-2 mt-2">
          <span className={`w-2 h-2 rounded-full ${content.status === 'success' ? 'bg-blun-green' : 'bg-blun-red'}`} />
          <span className="text-xs text-blun-fg3">{content.status === 'success' ? 'Erfolgreich' : 'Fehlgeschlagen'}</span>
        </div>
      )}
    </div>
  );
}
