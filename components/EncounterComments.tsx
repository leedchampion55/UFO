import Link from "next/link";
import { EncounterCommentForm, OwnerControls, PostingPrompt, ReportForm } from "./CommunityForms";
import { getMemberSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const pageSize = 15;
type CommentProfile = { username: string; displayName: string | null };

export async function EncounterComments({ encounterId, slug, page = 1, reported = false }: { encounterId: string; slug: string; page?: number; reported?: boolean }) {
  const member = await getMemberSession();
  const where = { encounterId, parentId: null, deletedAt: null };
  const [total, comments] = await Promise.all([
    prisma.encounterComment.count({ where }),
    prisma.encounterComment.findMany({
      where,
      include: { author: true, replies: { where: { deletedAt: null }, include: { author: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const state = { signedIn: Boolean(member), verified: Boolean(member?.verified), suspended: Boolean(member?.suspended), ownProfileId: member?.profile.id };
  const canPost = state.signedIn && state.verified && !state.suspended;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const returnTo = `/encounters/${slug}`;

  return <section className="section encounter-comments"><div className="container narrow">
    <p className="eyebrow">Open case discussion</p><h2>Community comments</h2>
    <p>Keep replies curious, kind and mindful of the contributor’s privacy.</p>
    {reported && <p className="community-alert">Report received for moderator review.</p>}
    {comments.length ? <div className="comment-list">{comments.map((comment) => <article className="comment-card" key={comment.id}>
      <CommentAuthor profile={comment.author} /><div>
        <p className="post-label">{comment.createdAt.toLocaleString("en-GB")}{comment.editedAt && " · edited"}</p><p>{comment.body}</p>
        {member?.profile.id === comment.authorId && <OwnerControls type="comment" id={comment.id} body={comment.body} />}
        <ReportForm targetType="ENCOUNTER_COMMENT" targetId={comment.id} returnTo={returnTo} />
        <div className="comment-replies">{comment.replies.map((reply) => <article key={reply.id}>
          <CommentAuthor profile={reply.author} /><div>
            <p className="post-label">{reply.createdAt.toLocaleString("en-GB")}{reply.editedAt && " · edited"}</p><p>{reply.body}</p>
            {member?.profile.id === reply.authorId && <OwnerControls type="comment" id={reply.id} body={reply.body} />}
            <ReportForm targetType="ENCOUNTER_COMMENT" targetId={reply.id} returnTo={returnTo} />
          </div>
        </article>)}</div>
        {canPost && <EncounterCommentForm encounterId={encounterId} parentId={comment.id} />}
      </div>
    </article>)}</div> : <p className="empty-inline">No comments yet. Start the first thoughtful conversation.</p>}
    {pages > 1 && <nav className="pagination">{page > 1 && <Link href={`${returnTo}?comments=${page - 1}`}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={`${returnTo}?comments=${page + 1}`}>Next</Link>}</nav>}
    <PostingPrompt state={state}><EncounterCommentForm encounterId={encounterId} /></PostingPrompt>
  </div></section>;
}

function CommentAuthor({ profile }: { profile: CommentProfile | null }) {
  return <aside><div className="avatar">{profile?.username.slice(0, 1).toUpperCase() ?? "?"}</div>{profile ? <Link href={`/members/${profile.username.toLowerCase()}`}><strong>{profile.displayName || profile.username}</strong></Link> : <strong>Deleted member</strong>}</aside>;
}
