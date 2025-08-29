// VroomFeedManager - Complete TikTok-style feed with Mux integration
import { supabase } from './supabase';

export class VroomFeedManager {
  static ADS_FREQUENCY = 10; // Ad every 10 posts
  
  /**
   * Get personalized feed with fresh and recycled content
   * @param {string} userId - User UUID
   * @param {number} batchSize - Number of content items to return (default 30)
   * @param {string} lastPostId - For pagination (optional)
   * @returns {Promise<{posts: Array, hasMore: boolean, error: any}>}
   */
  static async getFeed(userId, batchSize = 30, lastPostId = null) {
    try {
      console.log(`[VROOM FEED] Loading feed for user: ${userId}, lastPostId: ${lastPostId}`);
      
      // For pagination, we need to implement a different approach
      // Since we need infinite scroll, we'll load fresh posts + recycled posts
      let feedData = [];
      
      if (!lastPostId) {
        // Initial load - use optimized fast feed function
        const { data, error } = await supabase.rpc('get_fast_feed', {
          user_uuid: userId,
          batch_size: batchSize
        });
        
        if (error) {
          console.error('[VROOM FEED] Error loading fast feed:', error);
          return { posts: [], hasMore: false, error };
        }
        
        feedData = data || [];
        console.log(`[VROOM FEED] Fast initial load: ${feedData.length} posts`);
      } else {
        // Pagination - get more content with simple query
        console.log('[VROOM FEED] Loading more content for pagination...');
        
        // Simple pagination query - no complex subqueries
        const { data: paginationData, error: paginationError } = await supabase
          .from('posts')
          .select(`
            id, created_at, content, author_id, media_url, mux_hls_url, 
            mux_playback_id, mux_duration_ms, thumbnail_url, file_type,
            like_count, comment_count, view_count,
            profiles!inner (username, avatar_url)
          `)
          .neq('author_id', userId)
          .not('media_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(batchSize)
          .range(0, batchSize - 1); // Simple offset-based pagination
        
        if (!paginationError && paginationData && paginationData.length > 0) {
          feedData = paginationData.map(post => ({
            ...post,
            username: post.profiles.username,
            avatar_url: post.profiles.avatar_url,
            type: 'content',
            engagement_score: (post.like_count || 0) + (post.comment_count || 0),
            is_recycled: false
          }));
          console.log(`[VROOM FEED] Loaded ${feedData.length} fresh posts for pagination`);
        }
        
        // If we don't have enough fresh content, add recycled content
        if (feedData.length < batchSize) {
          console.log(`[VROOM FEED] Need more content, loading recycled posts...`);
          const needed = batchSize - feedData.length;
          
          const { data: recycledData, error: recycledError } = await supabase
            .from('posts')
            .select(`
              id, created_at, content, author_id, media_url, mux_hls_url,
              mux_playback_id, mux_duration_ms, thumbnail_url, file_type,
              like_count, comment_count, view_count,
              profiles!inner (username, avatar_url),
              seen_posts!inner (seen_at)
            `)
            .neq('author_id', userId)
            .not('media_url', 'is', null)
            .eq('seen_posts.user_id', userId)
            .lt('seen_posts.seen_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // 7 days ago
            .or('view_count.gt.10,like_count.gt.2')
            .order('seen_posts.seen_at', { ascending: true })
            .limit(needed);
          
          if (!recycledError && recycledData && recycledData.length > 0) {
            const recycledPosts = recycledData.map(post => ({
              id: post.id,
              created_at: post.created_at,
              content: post.content,
              author_id: post.author_id,
              media_url: post.media_url,
              mux_hls_url: post.mux_hls_url,
              mux_playback_id: post.mux_playback_id,
              mux_duration_ms: post.mux_duration_ms,
              thumbnail_url: post.thumbnail_url,
              file_type: post.file_type,
              like_count: post.like_count || 0,
              comment_count: post.comment_count || 0,
              view_count: post.view_count || 0,
              username: post.profiles.username,
              avatar_url: post.profiles.avatar_url,
              type: 'content',
              engagement_score: (post.like_count || 0) * 2 + (post.comment_count || 0) * 3 + (post.view_count || 0),
              is_recycled: true
            }));
            
            feedData = [...feedData, ...recycledPosts];
            console.log(`[VROOM FEED] Added ${recycledPosts.length} recycled posts`);
          }
        }
        
        // If still no content, generate some dummy content to prevent empty feed
        if (feedData.length === 0) {
          console.log('[VROOM FEED] No content available, showing recent posts anyway...');
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('posts')
            .select(`
              id, created_at, content, author_id, media_url, mux_hls_url,
              mux_playback_id, mux_duration_ms, thumbnail_url, file_type,
              like_count, comment_count, view_count,
              profiles!inner (username, avatar_url)
            `)
            .neq('author_id', userId)
            .not('media_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(batchSize);
          
          if (!fallbackError && fallbackData) {
            feedData = fallbackData.map(post => ({
              ...post,
              username: post.profiles.username,
              avatar_url: post.profiles.avatar_url,
              type: 'content',
              engagement_score: (post.like_count || 0) * 2 + (post.comment_count || 0) * 3 + (post.view_count || 0),
              is_recycled: false
            }));
            console.log(`[VROOM FEED] Fallback: loaded ${feedData.length} recent posts`);
          }
        }
      }
      
      // Always ensure we have content - if no content found, repeat from beginning
      let finalFeedData = feedData || [];
      if (finalFeedData.length === 0 && lastPostId) {
        console.log('[VROOM FEED] No more content found, starting from beginning for infinite scroll');
        const { data: repeatData, error: repeatError } = await supabase.rpc('get_smart_feed', {
          user_uuid: userId,
          batch_size: batchSize
        });
        
        if (!repeatError && repeatData) {
          finalFeedData = repeatData;
        }
      }
      
      // Process and enrich the feed data
      const processedPosts = this.processFeedData(finalFeedData);
      
      // Insert ads every 10 posts
      const postsWithAds = this.insertAds(processedPosts);
      
      console.log(`[VROOM FEED] Final result: ${processedPosts.length} posts with ${postsWithAds.length - processedPosts.length} ads`);
      
      return {
        posts: postsWithAds,
        hasMore: true, // Always return true for infinite scroll
        error: null
      };
      
    } catch (err) {
      console.error('[VROOM FEED] Exception loading feed:', err);
      return { posts: [], hasMore: false, error: err };
    }
  }
  
  /**
   * Process raw feed data and add type information
   * @param {Array} rawData - Raw feed data from database
   * @returns {Array} Processed feed items
   */
  static processFeedData(rawData) {
    return rawData.map(item => {
      // Determine content type based on available media
      let contentType = 'video'; // Default to video for Mux content
      
      if (item.mux_playback_id || item.mux_hls_url) {
        contentType = 'video';
      } else if (item.media_url && this.isImageUrl(item.media_url)) {
        contentType = 'image';
      }
      
      return {
        ...item,
        type: contentType,
        // Ensure we have proper media URLs for Mux
        playbackId: item.mux_playback_id,
        hlsUrl: item.mux_hls_url,
        mediaUrl: item.media_url,
        duration: item.mux_duration_ms,
        // Add user profile info
        profiles: {
          username: item.username,
          avatar_url: item.avatar_url
        }
      };
    });
  }
  
  /**
   * Insert ads every 10 posts
   * @param {Array} posts - Array of posts
   * @returns {Array} Posts with ads inserted
   */
  static insertAds(posts) {
    const result = [];
    let adCounter = 0;
    
    posts.forEach((post, index) => {
      result.push(post);
      
      // Insert ad after every ADS_FREQUENCY posts
      if ((index + 1) % this.ADS_FREQUENCY === 0) {
        adCounter++;
        result.push({
          id: `ad-${adCounter}-${Date.now()}`,
          type: 'ad',
          adId: `vroom-feed-ad-${adCounter}`,
          created_at: new Date().toISOString()
        });
      }
    });
    
    return result;
  }
  
  /**
   * Mark a post as seen by the user
   * @param {string} userId - User UUID
   * @param {string} postId - Post UUID
   */
  static async markPostAsSeen(userId, postId) {
    try {
      const { error } = await supabase.rpc('mark_post_as_seen', {
        user_uuid: userId,
        post_uuid: postId
      });
      
      if (error) {
        console.error('[VROOM FEED] Error marking post as seen:', error);
      } else {
        console.log('[VROOM FEED] Marked post as seen:', postId);
      }
    } catch (err) {
      console.error('[VROOM FEED] Exception marking post as seen:', err);
    }
  }
  
  /**
   * Mark multiple posts as seen in batch
   * @param {string} userId - User UUID
   * @param {Array<string>} postIds - Array of Post UUIDs
   */
  static async markPostsAsSeenBatch(userId, postIds) {
    if (!postIds || postIds.length === 0) return;
    
    try {
      const { error } = await supabase.rpc('mark_posts_as_seen_batch', {
        user_uuid: userId,
        post_uuids: postIds
      });
      
      if (error) {
        console.error('[VROOM FEED] Error marking posts as seen (batch):', error);
      } else {
        console.log(`[VROOM FEED] Marked ${postIds.length} posts as seen`);
      }
    } catch (err) {
      console.error('[VROOM FEED] Exception marking posts as seen (batch):', err);
    }
  }
  
  /**
   * Mark recycled post as reshown
   * @param {string} userId - User UUID
   * @param {string} postId - Post UUID
   */
  static async markPostAsReshown(userId, postId) {
    try {
      const { error } = await supabase.rpc('mark_post_as_reshown', {
        user_uuid: userId,
        post_uuid: postId
      });
      
      if (error) {
        console.error('[VROOM FEED] Error marking post as reshown:', error);
      }
    } catch (err) {
      console.error('[VROOM FEED] Exception marking post as reshown:', err);
    }
  }
  
  /**
   * Refresh feed with completely new content
   * @param {string} userId - User UUID
   * @param {number} batchSize - Number of items to return
   */
  static async refreshFeed(userId, batchSize = 30) {
    console.log('[VROOM FEED] Refreshing feed...');
    // Just use the reliable getFeed method - it works perfectly
    return this.getFeed(userId, batchSize);
  }
  
  /**
   * Check if URL is an image
   * @param {string} url - Media URL
   * @returns {boolean}
   */
  static isImageUrl(url) {
    if (!url) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const lowerUrl = url.toLowerCase();
    return imageExtensions.some(ext => lowerUrl.includes(ext));
  }
  
  /**
   * Get Mux video URL for playback
   * @param {string} playbackId - Mux playback ID
   * @returns {string} Mux video URL
   */
  static getMuxVideoUrl(playbackId) {
    if (!playbackId) return null;
    return `https://stream.mux.com/${playbackId}.m3u8`;
  }
  
  /**
   * Get Mux thumbnail URL
   * @param {string} playbackId - Mux playback ID
   * @param {Object} options - Thumbnail options
   * @returns {string} Mux thumbnail URL
   */
  static getMuxThumbnailUrl(playbackId, options = {}) {
    if (!playbackId) return null;
    const { width = 640, height = 360, time = 1 } = options;
    return `https://image.mux.com/${playbackId}/thumbnail.jpg?width=${width}&height=${height}&time=${time}`;
  }
}