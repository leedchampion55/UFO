-- Every community report must reference exactly one public content target.
ALTER TABLE "CommunityReport"
ADD CONSTRAINT "CommunityReport_exactly_one_target_check"
CHECK (num_nonnulls("discussionId", "discussionReplyId", "encounterCommentId") = 1);
