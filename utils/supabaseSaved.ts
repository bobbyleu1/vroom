import { supabase } from './supabase';

export async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function savePost(postId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('AUTH_REQUIRED');
  // unique (user_id, post_id)
  const { error } = await supabase.from('saved_posts').insert({ user_id: userId, post_id: postId });
  // Ignore duplicate key errors
  if (error && error.code !== '23505') throw error;
}

export async function unsavePost(postId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('AUTH_REQUIRED');
  const { error } = await supabase.from('saved_posts')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId);
  if (error) throw error;
}