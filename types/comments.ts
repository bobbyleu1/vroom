export type Comment = {
  id: string;
  content: string;
  post_id: string;
  author_id: string;
  created_at: string;
  like_count: number | string | null;
  parent_comment_id?: string | null;
  profiles?: {
    username: string;
    avatar_url?: string;
  };
  author_username?: string;
  author_avatar?: string;
  created_at_formatted?: string;
  hasLiked?: boolean;
  likes?: number;
};