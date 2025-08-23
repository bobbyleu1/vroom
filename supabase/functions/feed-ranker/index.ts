import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface FeedRequest {
  user_id: string;
  page_size?: number;
  page_after?: {score: number, id: string} | null;
  session_id: string;
  session_opened_at: string;
  refresh_nonce?: number;
  force_refresh?: boolean;
}

interface FeedResponse {
  items: any[];
  next_page_after: {score: number, id: string} | null;
  total_candidates: number;
  cache_hit: boolean;
  used_refresh_nonce: number;
  variation_stats?: {
    previous_count: number;
    current_count: number;
    different_count: number;
    variation: number;
    low_variation: boolean;
  };
  performance_stats?: {
    execution_time_ms: number;
    cache_lookup_ms: number;
    db_query_ms: number;
  };
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Constants
const CACHE_TTL_MS = 60000; // 60 seconds
const REPEAT_COOLDOWN_DAYS = 7;
const MAX_FEED_DURATION_MS = 300000; // 5 minutes
const WATERLINE = 30;
const MAX_REPEATS_PER_PAGE = 3;

// Open Deno KV store for persistent caching
const kv = await Deno.openKv();

// Hash function for seeded randomness
function hash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Seeded jitter for score perturbation
function jitter(seed: number, postId: string): number {
  const combined = hash(seed.toString() + postId);
  return (combined % 10000) / 10000; // 0-1 range
}

// Check variation between two feed pages
function checkVariation(previousIds: string[], currentIds: string[]): {
  variation: number;
  different_count: number;
  low_variation: boolean;
} {
  const prevSet = new Set(previousIds);
  const different_count = currentIds.filter(id => !prevSet.has(id)).length;
  const variation = different_count / Math.min(currentIds.length, 12); // Check top 12
  const low_variation = different_count < 5; // Less than 5 different items
  
  return { variation, different_count, low_variation };
}

serve(async (req: Request) => {
  const startTime = Date.now();
  let cacheStartTime = 0;
  let dbStartTime = 0;
  
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body: FeedRequest = await req.json();
    const { 
      user_id, 
      page_size = 12, 
      page_after = null, 
      session_id, 
      session_opened_at,
      refresh_nonce = 0,
      force_refresh = false
    } = body;

    if (!user_id || !session_id || !session_opened_at) {
      return new Response(JSON.stringify({ 
        error: 'user_id, session_id, and session_opened_at are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('FeedRanker: Processing request for user:', user_id, 
      'page_size:', page_size, 'refresh_nonce:', refresh_nonce, 'force_refresh:', force_refresh);

    // Create new cache key with refresh_nonce
    const cacheKey = `feed:${user_id}:${session_opened_at}:${refresh_nonce}`;
    const now = Date.now();

    // Check cache first (unless force_refresh is true)
    if (!force_refresh) {
      cacheStartTime = Date.now();
      const cached = await kv.get(["feed_cache", cacheKey]);
      const cacheTime = Date.now() - cacheStartTime;
      
      if (cached.value && cached.value.expiry > now) {
        console.log('FeedRanker: Cache hit for key:', cacheKey, 'in', cacheTime, 'ms');
        
        const responseWithStats = {
          ...cached.value.data,
          cache_hit: true,
          performance_stats: {
            execution_time_ms: Date.now() - startTime,
            cache_lookup_ms: cacheTime,
            db_query_ms: 0
          }
        };
        
        return new Response(JSON.stringify(responseWithStats), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Generate seed for consistent jitter within this refresh
    const seed = hash(user_id + session_id + session_opened_at + refresh_nonce.toString());
    console.log('FeedRanker: Using seed:', seed, 'for refresh_nonce:', refresh_nonce);

    // Get posts from database with proper filtering
    // For refreshes, get extra posts to create more diversity
    const requestSize = refresh_nonce > 0 ? Math.min(page_size * 2, 50) : page_size;
    
    // Time the database operations
    dbStartTime = Date.now();
    
    // Build query with hard filters
    let query = supabase
      .from('posts')
      .select(`
        id,
        content,
        media_url,
        mux_hls_url,
        mux_playback_id,
        mux_duration_ms,
        thumbnail_url,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        created_at,
        profiles!inner(
          username,
          avatar_url
        )
      `)
      .eq('file_type', 'video')
      .eq('visibility', 'public')
      .not('mux_duration_ms', 'is', null)
      .lte('mux_duration_ms', MAX_FEED_DURATION_MS)
      .order('created_at', { ascending: false })
      .limit(requestSize * 3); // Get more candidates for filtering

    // Execute query
    const { data: rawPosts, error } = await query;
    
    if (error) {
      console.error('FeedRanker: Database error:', error);
      return new Response(JSON.stringify({ error: 'Database error', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user's impression history for never-repeat filtering
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - REPEAT_COOLDOWN_DAYS);
    
    const { data: recentImpressions } = await supabase
      .from('user_post_impressions')
      .select('post_id')
      .eq('user_id', user_id)
      .gte('created_at', cooldownDate.toISOString());
    
    const excludePostIds = new Set((recentImpressions || []).map(imp => imp.post_id));
    
    // Filter out posts in cooldown
    let feedData = (rawPosts || []).filter(post => !excludePostIds.has(post.id));
    
    // If we don't have enough posts, implement fallback ladder
    if (feedData.length < WATERLINE && excludePostIds.size > 0) {
      console.log('FeedRanker: Insufficient inventory, using fallback ladder');
      
      // Add controlled repeats from impressions (oldest first, max per page)
      const { data: fallbackPosts } = await supabase
        .from('posts')
        .select(`
          id, content, media_url, mux_hls_url, mux_playbook_id, mux_duration_ms,
          thumbnail_url, file_type, like_count, comment_count, view_count,
          author_id, created_at,
          profiles!inner(username, avatar_url)
        `)
        .eq('file_type', 'video')
        .eq('visibility', 'public')
        .in('id', Array.from(excludePostIds))
        .order('created_at', { ascending: true })
        .limit(MAX_REPEATS_PER_PAGE);
      
      if (fallbackPosts) {
        // Mark fallback posts and add to end (never in top-6)
        const markedFallbacks = fallbackPosts.map(post => ({
          ...post,
          source: 'fallback_repeat'
        }));
        
        feedData = [...feedData, ...markedFallbacks];
      }
    }
    
    const dbTime = Date.now() - dbStartTime;
    console.log('FeedRanker: Database operations completed in', dbTime, 'ms');

    if (error) {
      console.error('FeedRanker: Database error:', error);
      return new Response(JSON.stringify({ error: 'Database error', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!feedData || !Array.isArray(feedData)) {
      console.error('FeedRanker: Invalid data format:', feedData);
      return new Response(JSON.stringify({ error: 'Invalid data format' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Calculate engagement-based scores and apply seeded jitter
    const postsWithJitter = feedData.map((post: any, index: number) => {
      // Calculate base engagement score
      const likeWeight = 3;
      const commentWeight = 5;
      const viewWeight = 1;
      
      const engagementScore = (
        (post.like_count || 0) * likeWeight +
        (post.comment_count || 0) * commentWeight +
        (post.view_count || 0) * viewWeight
      ) / Math.max(1, Math.floor((Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60))); // Decay by hours
      
      // Apply small jitter for tie-breaking (0-1% as specified)
      const jitterValue = jitter(seed, post.id) * 0.01;
      const finalScore = engagementScore + jitterValue;
      
      return {
        ...post,
        original_score: engagementScore,
        jitter_value: jitterValue,
        score: finalScore,
        // Flatten profile information
        username: post.profiles?.username || 'Unknown',
        avatar_url: post.profiles?.avatar_url || null
      };
    });

    // Sort by adjusted score (descending)
    postsWithJitter.sort((a, b) => b.score - a.score);
    
    // Trim to requested page size after sorting and applying diversity
    const finalPosts = postsWithJitter.slice(0, page_size);

    // For variation checking, store previous page IDs from cache
    let previousPageIds: string[] = [];
    if (refresh_nonce > 0) {
      const prevCacheKey = `feed:${user_id}:${session_opened_at}:${refresh_nonce - 1}`;
      const previousCache = await kv.get(["feed_cache", prevCacheKey]);
      if (previousCache.value) {
        previousPageIds = previousCache.value.data.items.slice(0, 12).map((item: any) => item.id);
      }
    }

    // Check variation if we have a previous page
    let variationInfo = null;
    if (previousPageIds.length > 0) {
      const currentPageIds = finalPosts.slice(0, 12).map(post => post.id);
      variationInfo = checkVariation(previousPageIds, currentPageIds);
      
      if (variationInfo.low_variation) {
        console.warn('FeedRanker: low_variation detected', {
          user_id,
          refresh_nonce,
          previous_count: previousPageIds.length,
          current_count: currentPageIds.length,
          different_count: variationInfo.different_count,
          variation: variationInfo.variation,
          total_candidates: postsWithJitter.length,
          candidate_counts: {
            total: postsWithJitter.length,
            fallback_repeats: postsWithJitter.filter(p => p.source === 'fallback_repeat').length
          },
          performance_impact: {
            execution_time_ms: Date.now() - startTime,
            above_p95_threshold: (Date.now() - startTime) > 200
          }
        });
      }
      
      console.log('FeedRanker: Variation check:', variationInfo);
    }

    const executionTime = Date.now() - startTime;
    
    // Log performance warning if above P95 threshold
    if (executionTime > 200) {
      console.warn('FeedRanker: Performance above P95 threshold', {
        user_id,
        refresh_nonce,
        execution_time_ms: executionTime,
        page_size,
        total_candidates: postsWithJitter.length
      });
    }

    const response: FeedResponse = {
      items: finalPosts,
      next_page_after: finalPosts.length > 0 ? 
        { score: finalPosts[finalPosts.length - 1].score, id: finalPosts[finalPosts.length - 1].id } : 
        null,
      total_candidates: postsWithJitter.length,
      cache_hit: false,
      used_refresh_nonce: refresh_nonce,
      variation_stats: variationInfo || undefined,
      performance_stats: {
        execution_time_ms: executionTime,
        cache_lookup_ms: 0, // No cache lookup for new requests
        db_query_ms: dbTime
      }
    };

    // Cache the result in Deno KV
    await kv.set(["feed_cache", cacheKey], {
      data: response,
      expiry: now + CACHE_TTL_MS
    }, { expireIn: CACHE_TTL_MS });

    console.log('FeedRanker: Returning', finalPosts.length, 'posts with refresh_nonce:', refresh_nonce, 'in', executionTime, 'ms');

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('FeedRanker: Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});