// VroomFeedManager - Complete TikTok-style feed with Mux integration
import { supabase } from './supabase';

export class VroomFeedManager {
  static ADS_FREQUENCY = 10; // Ad every 10 posts
  
  // Session-based tracking to prevent repetition within same session
  static sessionCache = new Map(); // userId -> { shownPostIds: Set, recentAuthors: Array, sessionStart: timestamp }
  static SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
  static MAX_CONSECUTIVE_FROM_AUTHOR = 0; // ZERO posts per author before switching - no clustering allowed
  static RECENT_AUTHOR_MEMORY = 10; // Remember last 10 authors to avoid clustering
  
  /**
   * Initialize or refresh session tracking for user
   */
  static initUserSession(userId) {
    const now = Date.now();
    const existing = this.sessionCache.get(userId);
    
    // Create new session or reset if expired
    if (!existing || (now - existing.sessionStart) > this.SESSION_DURATION_MS) {
      this.sessionCache.set(userId, {
        shownPostIds: new Set(),
        recentAuthors: [], // Track recent authors to prevent clustering
        sessionStart: now
      });
      console.log(`[VROOM FEED] Started new session for user: ${userId}`);
    }
    
    return this.sessionCache.get(userId);
  }
  
  /**
   * Add post IDs and authors to session tracking
   */
  static trackShownPosts(userId, posts) {
    const session = this.initUserSession(userId);
    
    posts.forEach(post => {
      if (post.id) {
        session.shownPostIds.add(post.id);
      }
      if (post.author_id) {
        // Add to recent authors and keep only recent ones
        session.recentAuthors.push(post.author_id);
        if (session.recentAuthors.length > this.RECENT_AUTHOR_MEMORY) {
          session.recentAuthors.shift();
        }
      }
    });
    
    console.log(`[VROOM FEED] Session now tracking ${session.shownPostIds.size} shown posts from ${new Set(session.recentAuthors).size} recent authors`);
  }
  
  /**
   * Get posts that haven't been shown in this session
   */
  static filterUnseenPosts(userId, posts) {
    const session = this.initUserSession(userId);
    const unseen = posts.filter(post => !session.shownPostIds.has(post.id));
    
    if (unseen.length < posts.length) {
      const filtered = posts.length - unseen.length;
      console.log(`[VROOM FEED] Session filtered out ${filtered} already-seen posts`);
    }
    
    return unseen;
  }
  
  /**
   * Filter posts for diversity - avoid repeats and author clustering
   */
  static filterForDiversity(userId, posts, maxSizeNeeded = 15) {
    const session = this.initUserSession(userId);
    
    console.log(`[DIVERSITY] Starting with ${posts.length} posts, need ${maxSizeNeeded}`);
    console.log(`[DIVERSITY] Recent authors: ${session.recentAuthors.slice(-3)}`);
    
    // First, filter out already seen posts
    const unseenPosts = posts.filter(post => !session.shownPostIds.has(post.id));
    console.log(`[DIVERSITY] After filtering seen posts: ${unseenPosts.length} unseen`);
    
    // Then, diversify by author to avoid clustering - MUCH more aggressive
    const diversifiedPosts = [];
    const usedAuthors = new Set();
    
    // Get the last 3 authors to avoid clustering (instead of just 1)
    const recentAuthors = new Set(session.recentAuthors.slice(-3));
    
    // AGGRESSIVE FIRST PASS: Only allow completely new authors
    for (const post of unseenPosts) {
      if (diversifiedPosts.length >= maxSizeNeeded) break;
      
      const authorId = post.author_id;
      
      // Skip if this author was in the last 3 posts
      if (recentAuthors.has(authorId)) {
        console.log(`[DIVERSITY] Skipping post from recent author: ${authorId}`);
        continue;
      }
      
      // Skip if we already have a post from this author in this batch
      if (usedAuthors.has(authorId)) {
        console.log(`[DIVERSITY] Skipping duplicate author in batch: ${authorId}`);
        continue;
      }
      
      diversifiedPosts.push(post);
      usedAuthors.add(authorId);
      console.log(`[DIVERSITY] Added post from new author: ${authorId}`);
    }
    
    console.log(`[DIVERSITY] After aggressive pass: ${diversifiedPosts.length} diverse posts`);
    
    // SECOND PASS: If we need more content, allow authors not in last 2 posts
    if (diversifiedPosts.length < maxSizeNeeded) {
      const lastTwoAuthors = new Set(session.recentAuthors.slice(-2));
      
      for (const post of unseenPosts) {
        if (diversifiedPosts.length >= maxSizeNeeded) break;
        
        // Skip if already included
        if (diversifiedPosts.includes(post)) continue;
        
        const authorId = post.author_id;
        
        // Only avoid the last 2 authors (instead of 3)
        if (lastTwoAuthors.has(authorId)) continue;
        
        // Still avoid duplicates in this batch
        if (usedAuthors.has(authorId)) continue;
        
        diversifiedPosts.push(post);
        usedAuthors.add(authorId);
        console.log(`[DIVERSITY] Added post from semi-recent author: ${authorId}`);
      }
    }
    
    console.log(`[DIVERSITY] After second pass: ${diversifiedPosts.length} posts`);
    
    // THIRD PASS: Only if desperate for content, allow last author
    if (diversifiedPosts.length < Math.min(3, maxSizeNeeded)) {
      const lastAuthor = session.recentAuthors[session.recentAuthors.length - 1];
      
      for (const post of unseenPosts) {
        if (diversifiedPosts.length >= maxSizeNeeded) break;
        
        if (diversifiedPosts.includes(post)) continue;
        
        // Only allow if we're desperate AND it's not creating immediate back-to-back
        if (post.author_id === lastAuthor && diversifiedPosts.length > 0) continue;
        
        diversifiedPosts.push(post);
        console.log(`[DIVERSITY] DESPERATE: Added post from recent author: ${post.author_id}`);
      }
    }
    
    const totalFiltered = posts.length - unseenPosts.length;
    const diversityFiltered = unseenPosts.length - diversifiedPosts.length;
    
    console.log(`[DIVERSITY] FINAL: ${diversifiedPosts.length} posts (filtered ${totalFiltered} seen + ${diversityFiltered} clustering)`);
    
    // Log the final author sequence to debug clustering
    const finalAuthors = diversifiedPosts.map(p => p.author_id).slice(0, 5);
    console.log(`[DIVERSITY] Final author sequence: ${finalAuthors}`);
    
    return diversifiedPosts;
  }
  
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
      
      // Initialize session tracking
      this.initUserSession(userId);
      
      // For pagination, we need to implement a different approach
      // Since we need infinite scroll, we'll load fresh posts + recycled posts
      let feedData = [];
      
      if (!lastPostId) {
        // Initial load - use smart feed for fresh content
        const { data, error } = await supabase.rpc('get_smart_feed', {
          user_uuid: userId,
          batch_size: batchSize
        });
        
        if (error) {
          console.error('[VROOM FEED] Error loading smart feed:', error);
          // Fallback to fast feed
          const { data: fastData, error: fastError } = await supabase.rpc('get_fast_feed', {
            user_uuid: userId,
            batch_size: batchSize
          });
          
          if (fastError) {
            console.error('[VROOM FEED] Error loading fast feed fallback:', fastError);
            return { posts: [], hasMore: false, error: fastError };
          }
          
          feedData = fastData || [];
          
          // Apply diversity filtering to fallback too
          if (feedData.length > 0) {
            feedData = this.filterForDiversity(userId, feedData, batchSize);
            console.log(`[VROOM FEED] Fast feed fallback after diversity filtering: ${feedData.length} posts`);
          }
        } else {
          feedData = data || [];
        }
        
        // Apply diversity filtering to initial load too
        if (feedData.length > 0) {
          feedData = this.filterForDiversity(userId, feedData, batchSize);
          console.log(`[VROOM FEED] Smart initial load after diversity filtering: ${feedData.length} posts`);
        } else {
          console.log(`[VROOM FEED] Smart initial load: ${feedData.length} posts`);
        }
      } else {
        // Pagination - get more content with simple query
        console.log('[VROOM FEED] Loading more content for pagination...');
        
        // Get extra posts to account for filtering - we'll filter down to batchSize
        const bufferSize = Math.max(batchSize * 3, 50); // 3x buffer for heavy filtering
        
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
          .limit(bufferSize) // Get more posts to account for filtering
        
        if (!paginationError && paginationData && paginationData.length > 0) {
          // Filter for diversity - avoid repeats and author clustering
          const diversePosts = this.filterForDiversity(userId, paginationData, batchSize);
          
          feedData = diversePosts.map(post => ({
            ...post,
            username: post.profiles.username,
            avatar_url: post.profiles.avatar_url,
            type: 'content',
            engagement_score: (post.like_count || 0) + (post.comment_count || 0),
            is_recycled: false
          }));
          console.log(`[VROOM FEED] Loaded ${feedData.length} diverse posts for pagination`);
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
            // Filter fallback data for diversity
            const diverseFallbacks = this.filterForDiversity(userId, fallbackData, batchSize);
            
            feedData = diverseFallbacks.map(post => ({
              ...post,
              username: post.profiles.username,
              avatar_url: post.profiles.avatar_url,
              type: 'content',
              engagement_score: (post.like_count || 0) * 2 + (post.comment_count || 0) * 3 + (post.view_count || 0),
              is_recycled: false
            }));
            console.log(`[VROOM FEED] Fallback: loaded ${feedData.length} diverse recent posts`);
          }
        }
      }
      
      // Ensure we have content - if no fresh content, try different approaches
      let finalFeedData = feedData || [];
      if (finalFeedData.length === 0 && lastPostId) {
        console.log('[VROOM FEED] No fresh content found, trying to get more diverse content...');
        
        // Try to get content from different time periods or criteria instead of repeating
        const { data: diverseData, error: diverseError } = await supabase
          .from('posts')
          .select(`
            id, created_at, content, author_id, media_url, mux_hls_url,
            mux_playback_id, mux_duration_ms, thumbnail_url, file_type,
            like_count, comment_count, view_count,
            profiles!inner (username, avatar_url)
          `)
          .neq('author_id', userId)
          .not('media_url', 'is', null)
          .order('view_count', { ascending: false }) // Try different ordering
          .limit(batchSize);
        
        if (!diverseError && diverseData && diverseData.length > 0) {
          // Filter diverse content for author diversity too
          const diversifiedContent = this.filterForDiversity(userId, diverseData, batchSize);
          
          finalFeedData = diversifiedContent.map(post => ({
            ...post,
            username: post.profiles.username,
            avatar_url: post.profiles.avatar_url,
            type: 'content',
            engagement_score: (post.like_count || 0) * 2 + (post.comment_count || 0) * 3,
            is_recycled: true,
            diverse_content: true
          }));
          console.log(`[VROOM FEED] Found ${finalFeedData.length} author-diverse posts to continue infinite scroll`);
        } else {
          console.log('[VROOM FEED] No more diverse content, cycling back to beginning for infinite scroll');
          // Cycle back to the beginning for truly infinite scroll like TikTok
          const { data: cycleData, error: cycleError } = await supabase.rpc('get_smart_feed', {
            user_uuid: userId,
            batch_size: batchSize
          });
          
          if (!cycleError && cycleData) {
            // For cycling, be more permissive but still try to avoid immediate repeats
            const session = this.initUserSession(userId);
            const recentlyShown = Array.from(session.shownPostIds).slice(-20); // Only avoid last 20 posts
            const lessRecentData = cycleData.filter(post => !recentlyShown.includes(post.id));
            
            // If we still have unseen content, use it. Otherwise, allow repeats for true infinite scroll
            const finalCycleData = lessRecentData.length > 0 ? lessRecentData : cycleData;
            
            finalFeedData = finalCycleData.map(post => ({
              ...post,
              is_recycled: true,
              cycle_content: true
            }));
            console.log(`[VROOM FEED] Cycling ${finalFeedData.length} posts for infinite scroll (avoided ${cycleData.length - lessRecentData.length} recent repeats)`);
          } else {
            // Last resort - get any recent posts to keep feed going
            const { data: anyData } = await supabase
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
              
            if (anyData && anyData.length > 0) {
              // For last resort, just avoid the most recent posts
              const session = this.initUserSession(userId);
              const veryRecentlyShown = Array.from(session.shownPostIds).slice(-10); // Only avoid last 10 posts
              const lastResortData = anyData.filter(post => !veryRecentlyShown.includes(post.id));
              
              // Always provide something, even if it's a repeat
              const finalLastResort = lastResortData.length > 0 ? lastResortData : anyData;
              
              finalFeedData = finalLastResort.map(post => ({
                ...post,
                username: post.profiles.username,
                avatar_url: post.profiles.avatar_url,
                type: 'content',
                is_recycled: true,
                last_resort: true
              }));
              console.log(`[VROOM FEED] Last resort: using ${finalFeedData.length} posts (avoided ${anyData.length - lastResortData.length} very recent repeats)`);
            }
          }
        }
      }
      
      // Process and enrich the feed data
      const processedPosts = this.processFeedData(finalFeedData);
      
      // Insert ads every 10 posts
      const postsWithAds = this.insertAds(processedPosts);
      
      // Track the posts we're returning to prevent future repetition
      const contentPosts = processedPosts.filter(post => post.id && post.author_id);
      if (contentPosts.length > 0) {
        this.trackShownPosts(userId, contentPosts);
      }
      
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
    try {
      console.log('[VROOM FEED] Refreshing feed with fresh content...');
      
      // Reset session on manual refresh to allow seeing fresh content
      this.sessionCache.delete(userId);
      console.log('[VROOM FEED] Session reset for fresh content');
      
      // Use get_smart_feed for truly fresh content
      const { data: smartData, error: smartError } = await supabase.rpc('get_smart_feed', {
        user_uuid: userId,
        batch_size: batchSize
      });
      
      if (smartError) {
        console.error('[VROOM FEED] Error with get_smart_feed:', smartError);
        // Final fallback to regular getFeed
        return this.getFeed(userId, batchSize);
      }
      
      // Apply diversity filtering to refresh data too
      let diverseData = smartData || [];
      if (diverseData.length > 0) {
        diverseData = this.filterForDiversity(userId, diverseData, batchSize);
        console.log(`[VROOM FEED] Refresh after diversity filtering: ${diverseData.length} posts`);
      }
      
      const processedPosts = this.processFeedData(diverseData);
      const postsWithAds = this.insertAds(processedPosts);
      
      console.log(`[VROOM FEED] Refresh successful: ${processedPosts.length} diverse posts with ${postsWithAds.length - processedPosts.length} ads`);
      
      return {
        posts: postsWithAds,
        hasMore: true,
        error: null
      };
      
    } catch (err) {
      console.error('[VROOM FEED] Exception during refresh:', err);
      // Fallback to regular getFeed
      return this.getFeed(userId, batchSize);
    }
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