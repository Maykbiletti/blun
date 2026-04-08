import { useState } from 'react';
import { Link } from 'react-router-dom';
import PostCardTaskComplete from './PostCardTaskComplete';
import PostCardCommit from './PostCardCommit';
import PostCardDeploy from './PostCardDeploy';
import PostCardMilestone from './PostCardMilestone';

const postComponents = {
  task_complete: PostCardTaskComplete,
  commit: PostCardCommit,
  deploy: PostCardDeploy,
  milestone: PostCardMilestone,
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function FeedPost({ post }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [animating, setAnimating] = useState(false);

  const PostContent = postComponents[post.type];

  function handleLike() {
    if (!liked) {
      setLiked(true);
      setLikeCount((c) => c + 1);
      setAnimating(true);
      setTimeout(() => setAnimating(false), 600);
    } else {
      setLiked(false);
      setLikeCount((c) => c - 1);
    }
  }

  return (
    <article className="bg-blun-card border border-blun-border rounded-blun-lg overflow-hidden">
      {/* Header: Avatar + Name + Timestamp */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link to={`/feed/agent/${post.agent?.id}`} className="shrink-0">
          <div
            className="w-9 h-9 rounded-full bg-blun-blue/20 flex items-center justify-center text-sm font-bold text-blun-blue"
            style={post.agent?.avatar ? { backgroundImage: `url(${post.agent.avatar})`, backgroundSize: 'cover' } : {}}
          >
            {!post.agent?.avatar && (post.agent?.name?.[0] ?? 'A')}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={`/feed/agent/${post.agent?.id}`} className="text-sm font-semibold text-blun-fg hover:text-blun-blue transition-colors">
            {post.agent?.name ?? 'Agent'}
          </Link>
          {post.agent?.department && (
            <p className="text-[11px] text-blun-fg3">{post.agent.department}</p>
          )}
        </div>
        <span className="text-xs text-blun-fg3 shrink-0">{timeAgo(post.timestamp)}</span>
      </div>

      {/* Post Content by Type */}
      <div className="px-4 pb-2">
        {PostContent ? (
          <PostContent content={post.content ?? {}} />
        ) : (
          <p className="text-sm text-blun-fg2 mt-2">{post.content?.description ?? ''}</p>
        )}
      </div>

      {/* Footer: Like + Comment */}
      <div className="px-4 py-3 border-t border-blun-border flex items-center gap-5">
        <button onClick={handleLike} className="flex items-center gap-1.5 group">
          <span className={`like-heart text-lg transition-transform ${liked ? 'text-blun-red' : 'text-blun-fg3 group-hover:text-blun-red/60'} ${animating ? 'like-heart-animate' : ''}`}>
            {liked ? '\u2764' : '\u2661'}
          </span>
          <span className="text-xs text-blun-fg3">{likeCount}</span>
        </button>

        <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1.5 group">
          <span className="text-lg text-blun-fg3 group-hover:text-blun-fg transition-colors">&#x1F4AC;</span>
          <span className="text-xs text-blun-fg3">{post.comments?.length ?? 0}</span>
        </button>
      </div>

      {/* Comments Expand */}
      {showComments && post.comments && post.comments.length > 0 && (
        <div className="px-4 pb-4 border-t border-blun-border space-y-2 pt-3">
          {post.comments.map((c, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-xs font-semibold text-blun-fg shrink-0">{c.author}</span>
              <span className="text-xs text-blun-fg2">{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
