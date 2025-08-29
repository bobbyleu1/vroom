// Simple, clean feed algorithm
import { supabase } from './supabase';

export const SimpleFeedManager = {
  
  // Load fresh feed - just get most recent posts
  async loadFreshFeed(userId, pageSize = 20) {
    console.log('[SIMPLE FEED] Loading fresh feed...');
    
    try {
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id, created_at, content, author_id, media_url, playback_id, thumbnail_url,
          like_count, comment_count,
          profiles!inner (username, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(pageSize);

      if (error) {
        console.error('[SIMPLE FEED] Error loading posts:', error);
        return { posts: [], error };
      }

      console.log(`[SIMPLE FEED] Loaded ${posts?.length || 0} posts`);
      return { posts: posts || [], error: null };
      
    } catch (err) {
      console.error('[SIMPLE FEED] Exception loading feed:', err);
      return { posts: [], error: err };
    }
  },

  // Load more posts (pagination)
  async loadMorePosts(userId, lastPostCreatedAt, lastPostId, pageSize = 20) {
    console.log('[SIMPLE FEED] Loading more posts...');
    
    try {
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id, created_at, content, author_id, media_url, playback_id, thumbnail_url,
          like_count, comment_count,
          profiles!inner (username, avatar_url)
        `)
        .lt('created_at', lastPostCreatedAt)
        .order('created_at', { ascending: false })
        .limit(pageSize);

      if (error) {
        console.error('[SIMPLE FEED] Error loading more posts:', error);
        return { posts: [], error };
      }

      console.log(`[SIMPLE FEED] Loaded ${posts?.length || 0} more posts`);
      return { posts: posts || [], error: null };
      
    } catch (err) {
      console.error('[SIMPLE FEED] Exception loading more posts:', err);
      return { posts: [], error: err };
    }
  },

  // Simple refresh - just reload the first page
  async refreshFeed(userId, pageSize = 20) {
    console.log('[SIMPLE FEED] Refreshing feed...');
    return this.loadFreshFeed(userId, pageSize);
  }
};