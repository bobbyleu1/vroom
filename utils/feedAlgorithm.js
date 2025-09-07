import { supabase } from './supabase';

// Algorithm weights - easily adjustable
const WEIGHTS = {
  relevance: 0.4,
  engagement: 0.3,
  freshness: 0.2,
  diversity: 0.1
};

// Engagement thresholds for normalization
const ENGAGEMENT_THRESHOLDS = {
  high_like_rate: 0.1,    // 10% like rate is very good
  high_comment_rate: 0.05, // 5% comment rate is very good
  min_views_for_stats: 10  // Need minimum views for reliable stats
};

/**
 * Sigmoid normalization function
 * Maps any value to 0-1 range with smooth curve
 */
const sigmoid = (x, steepness = 10, midpoint = 0.5) => {
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
};

/**
 * Calculate relevance score based on user's social connections and interests
 */
const calculateRelevanceScore = async (post, userId, userConnections) => {
  let score = 0.1; // Base score for all posts
  
  const { friends, groups, interactions } = userConnections;
  
  // Friend's post gets highest relevance
  if (friends.includes(post.author_id)) {
    score += 0.8;
  }
  
  // Posts from group members
  const authorGroups = await getAuthorGroups(post.author_id);
  const commonGroups = authorGroups.filter(group => groups.includes(group));
  if (commonGroups.length > 0) {
    score += 0.6 * Math.min(1, commonGroups.length / 3); // Max bonus for 3+ common groups
  }
  
  // Content similarity based on hashtags/interactions
  if (post.hashtags && interactions.liked_hashtags) {
    const commonHashtags = post.hashtags.filter(tag => 
      interactions.liked_hashtags.includes(tag)
    );
    if (commonHashtags.length > 0) {
      score += 0.4 * Math.min(1, commonHashtags.length / 5);
    }
  }
  
  // User has viewed similar content from this author
  if (interactions.viewed_authors && interactions.viewed_authors[post.author_id] > 2) {
    score += 0.3;
  }
  
  // Mutual follows with post author
  const mutualFollows = await getMutualFollows(userId, post.author_id);
  if (mutualFollows > 0) {
    score += Math.min(0.2, mutualFollows * 0.05);
  }
  
  return Math.min(1, score); // Cap at 1.0
};

/**
 * Calculate engagement score based on likes, comments, views, and watch time
 */
const calculateEngagementScore = (post) => {
  const views = Math.max(post.view_count || 1, 1); // Avoid division by zero
  const likes = post.like_count || 0;
  const comments = post.comment_count || 0;
  
  // Calculate rates
  const likeRate = likes / views;
  const commentRate = comments / views;
  
  // Calculate average completion rate from user_video_tracking
  let completionRate = 0.5; // Default to 50%
  
  if (views > ENGAGEMENT_THRESHOLDS.min_views_for_stats) {
    // In a real implementation, we'd calculate this from user_video_tracking
    // For now, estimate based on engagement (high engagement = better completion)
    const estimatedCompletion = Math.min(0.9, 0.3 + (likeRate * 2) + (commentRate * 3));
    completionRate = estimatedCompletion;
  }
  
  // Weighted combination of engagement metrics
  const rawEngagement = (likeRate * 0.4) + (commentRate * 0.3) + (completionRate * 0.3);
  
  // Apply sigmoid normalization for smooth 0-1 scaling
  return sigmoid(rawEngagement, 15, 0.05); // Steeper curve, lower midpoint
};

/**
 * Calculate freshness score with viral content boost
 */
const calculateFreshnessScore = (post) => {
  const now = new Date();
  const postDate = new Date(post.created_at);
  const hoursOld = (now - postDate) / (1000 * 60 * 60);
  
  // Base freshness decay over 1 week (168 hours)
  let freshnessScore = Math.max(0, 1 - (hoursOld / 168));
  
  // Viral content boost - posts that got high engagement quickly
  const likesIn24h = post.like_count || 0;
  const isViral = likesIn24h > 100 && hoursOld < 24;
  if (isViral) {
    freshnessScore *= 1.5; // 50% boost for viral content
  }
  
  return Math.min(1, freshnessScore);
};

/**
 * Calculate diversity penalty to avoid showing same creator repeatedly
 */
const calculateDiversityPenalty = (post, recentlyShownAuthors) => {
  const authorPostCount = recentlyShownAuthors[post.author_id] || 0;
  return Math.min(0.3, authorPostCount * 0.1); // Max 30% penalty
};

/**
 * Get user's social connections and interaction history
 */
const getUserConnections = async (userId) => {
  try {
    // Get friends (people user follows)
    const { data: followsData } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);
    
    const friends = followsData?.map(f => f.following_id) || [];
    
    // Get user's groups
    const { data: groupsData } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    
    const groups = groupsData?.map(g => g.group_id) || [];
    
    // Get interaction history (liked hashtags, viewed authors)
    const { data: likesData } = await supabase
      .from('post_likes')
      .select('posts(hashtags, author_id)')
      .eq('user_id', userId)
      .limit(100); // Last 100 likes
    
    const likedHashtags = [...new Set(
      likesData?.flatMap(like => like.posts?.hashtags || []) || []
    )];
    
    const viewedAuthors = {};
    const { data: viewsData } = await supabase
      .from('user_video_tracking')
      .select('post_id, posts(author_id)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200); // Last 200 views
    
    viewsData?.forEach(view => {
      const authorId = view.posts?.author_id;
      if (authorId) {
        viewedAuthors[authorId] = (viewedAuthors[authorId] || 0) + 1;
      }
    });
    
    return {
      friends,
      groups,
      interactions: {
        liked_hashtags: likedHashtags,
        viewed_authors: viewedAuthors
      }
    };
  } catch (error) {
    console.error('Error fetching user connections:', error);
    return { friends: [], groups: [], interactions: {} };
  }
};

/**
 * Get groups that a specific author belongs to
 */
const getAuthorGroups = async (authorId) => {
  try {
    const { data } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', authorId);
    
    return data?.map(g => g.group_id) || [];
  } catch (error) {
    console.error('Error fetching author groups:', error);
    return [];
  }
};

/**
 * Get mutual follows between two users
 */
const getMutualFollows = async (userId1, userId2) => {
  try {
    const { data: user1Follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId1);
    
    const { data: user2Follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId2);
    
    const user1Following = new Set(user1Follows?.map(f => f.following_id) || []);
    const user2Following = user2Follows?.map(f => f.following_id) || [];
    
    return user2Following.filter(id => user1Following.has(id)).length;
  } catch (error) {
    console.error('Error calculating mutual follows:', error);
    return 0;
  }
};

/**
 * Fetch candidate posts for ranking - prioritize videos but include some photos
 */
const getCandidatePosts = async (userId, limit = 100, excludePostIds = []) => {
  try {
    console.log(`getCandidatePosts: Starting with limit=${limit}, excluding ${excludePostIds.length} posts`);
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
    
    // Calculate split: 80% videos, 20% photos
    const videoLimit = Math.floor(limit * 0.8);
    const photoLimit = Math.floor(limit * 0.2);
    
    // Build query for recent videos (prioritized)
    let recentVideoQuery = supabase
      .from('posts')
      .select(`
        id,
        created_at,
        media_url,
        thumbnail_url,
        content,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        hashtags,
        algorithm_score,
        profiles!posts_author_id_fkey (
          username,
          avatar_url
        )
      `)
      .eq('file_type', 'video')
      .gte('created_at', oneMonthAgo.toISOString())
      .neq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(videoLimit);
    
    // Add exclusions if provided
    if (excludePostIds.length > 0) {
      recentVideoQuery = recentVideoQuery.not('id', 'in', `(${excludePostIds.map(id => `'${id}'`).join(',')})`);
    }
    
    // Build query for recent photos (smaller portion)
    let recentPhotoQuery = supabase
      .from('posts')
      .select(`
        id,
        created_at,
        media_url,
        thumbnail_url,
        content,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        hashtags,
        algorithm_score,
        profiles!posts_author_id_fkey (
          username,
          avatar_url
        )
      `)
      .eq('file_type', 'image')
      .gte('created_at', oneMonthAgo.toISOString())
      .neq('author_id', userId)
      .order('like_count', { ascending: false }) // Sort photos by engagement since they compete more
      .limit(photoLimit);
    
    if (excludePostIds.length > 0) {
      recentPhotoQuery = recentPhotoQuery.not('id', 'in', `(${excludePostIds.map(id => `'${id}'`).join(',')})`);
    }
    
    // Build query for viral videos
    let viralVideoQuery = supabase
      .from('posts')
      .select(`
        id,
        created_at,
        media_url,
        thumbnail_url,
        content,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        hashtags,
        algorithm_score,
        profiles!posts_author_id_fkey (
          username,
          avatar_url
        )
      `)
      .eq('file_type', 'video')
      .lt('created_at', oneMonthAgo.toISOString())
      .gte('like_count', 10)
      .neq('author_id', userId)
      .order('like_count', { ascending: false })
      .limit(15); // Slightly reduce viral videos to make room for photos
    
    if (excludePostIds.length > 0) {
      viralVideoQuery = viralVideoQuery.not('id', 'in', `(${excludePostIds.map(id => `'${id}'`).join(',')})`);
    }
    
    // Execute all queries in parallel
    const [
      { data: recentVideos },
      { data: recentPhotos },
      { data: viralVideos }
    ] = await Promise.all([
      recentVideoQuery,
      recentPhotoQuery,
      viralVideoQuery
    ]);
    
    // Combine and deduplicate
    const allPosts = [
      ...(recentVideos || []),
      ...(recentPhotos || []),
      ...(viralVideos || [])
    ];
    const uniquePosts = allPosts.filter((post, index, arr) => 
      arr.findIndex(p => p.id === post.id) === index
    );
    
    console.log(`getCandidatePosts: Videos=${(recentVideos || []).length}, Photos=${(recentPhotos || []).length}, Viral=${(viralVideos || []).length}, Total unique=${uniquePosts.length}`);
    return uniquePosts;
  } catch (error) {
    console.error('Error fetching candidate posts:', error);
    return [];
  }
};

/**
 * Get user's recently viewed posts to track diversity
 */
const getRecentlyViewedAuthors = async (userId) => {
  try {
    const { data } = await supabase
      .from('user_video_tracking')
      .select('posts(author_id)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20); // Last 20 views
    
    const authorCounts = {};
    data?.forEach(view => {
      const authorId = view.posts?.author_id;
      if (authorId) {
        authorCounts[authorId] = (authorCounts[authorId] || 0) + 1;
      }
    });
    
    return authorCounts;
  } catch (error) {
    console.error('Error fetching recently viewed authors:', error);
    return {};
  }
};

/**
 * Main algorithm function - generates personalized feed
 */
export const generatePersonalizedFeed = async (userId, limit = 20, excludePostIds = []) => {
  try {
    console.log(`Generating feed for user ${userId}`);
    
    // Step 1: Get user context
    const [userConnections, candidatePosts, recentlyViewed] = await Promise.all([
      getUserConnections(userId),
      getCandidatePosts(userId, 200, excludePostIds), // Get more candidates to account for exclusions
      getRecentlyViewedAuthors(userId)
    ]);
    
    if (candidatePosts.length === 0) {
      console.log('No candidate posts found, returning empty feed');
      return [];
    }
    
    // Step 2: Score each post
    const scoredPosts = await Promise.all(
      candidatePosts.map(async (post) => {
        const relevanceScore = await calculateRelevanceScore(post, userId, userConnections);
        const engagementScore = calculateEngagementScore(post);
        const freshnessScore = calculateFreshnessScore(post);
        const diversityPenalty = calculateDiversityPenalty(post, recentlyViewed);
        
        // Add small random component to ensure variety (5% of total score)
        const randomComponent = Math.random() * 0.05;
        
        const finalScore = 
          (relevanceScore * WEIGHTS.relevance) +
          (engagementScore * WEIGHTS.engagement) +
          (freshnessScore * WEIGHTS.freshness) -
          (diversityPenalty * WEIGHTS.diversity) +
          randomComponent;
        
        return {
          ...post,
          scores: {
            relevance: relevanceScore,
            engagement: engagementScore,
            freshness: freshnessScore,
            diversity_penalty: diversityPenalty,
            final: finalScore
          }
        };
      })
    );
    
    // Step 3: Sort by final score
    scoredPosts.sort((a, b) => b.scores.final - a.scores.final);
    
    // Step 4: Apply diversity filter (max 2 posts per author in top results)
    const diverseFeed = [];
    const authorCounts = {};
    
    for (const post of scoredPosts) {
      const authorId = post.author_id;
      const currentCount = authorCounts[authorId] || 0;
      
      if (currentCount < 2) { // Max 2 posts per author
        diverseFeed.push(post);
        authorCounts[authorId] = currentCount + 1;
        
        if (diverseFeed.length >= limit) break;
      }
    }
    
    // Step 5: Update algorithm scores in database for analytics
    const scoreUpdates = diverseFeed.slice(0, limit).map(post => ({
      id: post.id,
      algorithm_score: post.scores.final
    }));
    
    if (scoreUpdates.length > 0) {
      await supabase
        .from('posts')
        .upsert(scoreUpdates, { onConflict: 'id' });
    }
    
    console.log(`Generated feed with ${diverseFeed.length} posts for user ${userId}`);
    
    return diverseFeed.slice(0, limit);
    
  } catch (error) {
    console.error('Error generating personalized feed:', error);
    
    // Fallback: return recent posts sorted by engagement
    const { data: fallbackPosts } = await supabase
      .from('posts')
      .select(`
        id,
        created_at,
        media_url,
        thumbnail_url,
        content,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        hashtags,
        algorithm_score,
        profiles!posts_author_id_fkey (
          username,
          avatar_url
        )
      `)
      .neq('author_id', userId)
      .order('like_count', { ascending: false })
      .limit(limit);
    
    return fallbackPosts || [];
  }
};

/**
 * Cold start algorithm for new users - prioritize videos but include some photos
 */
export const generateColdStartFeed = async (limit = 20, excludePostIds = []) => {
  try {
    console.log(`generateColdStartFeed: Starting with limit=${limit}, excluding ${excludePostIds.length} posts`);
    
    // For new users, show trending content from the last 7 days
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    // Split: 80% videos, 20% photos
    const videoLimit = Math.floor(limit * 0.8);
    const photoLimit = Math.floor(limit * 0.2);
    
    console.log(`generateColdStartFeed: Looking for ${videoLimit} videos and ${photoLimit} photos after ${oneWeekAgo.toISOString()}`);
    
    // Build trending videos query
    let trendingVideoQuery = supabase
      .from('posts')
      .select(`
        id,
        created_at,
        media_url,
        thumbnail_url,
        content,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        hashtags,
        algorithm_score,
        profiles!posts_author_id_fkey (
          username,
          avatar_url
        )
      `)
      .eq('file_type', 'video')
      .gte('created_at', oneWeekAgo.toISOString())
      .order('like_count', { ascending: false })
      .limit(videoLimit);
    
    // Build trending photos query
    let trendingPhotoQuery = supabase
      .from('posts')
      .select(`
        id,
        created_at,
        media_url,
        thumbnail_url,
        content,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        hashtags,
        algorithm_score,
        profiles!posts_author_id_fkey (
          username,
          avatar_url
        )
      `)
      .eq('file_type', 'image')
      .gte('created_at', oneWeekAgo.toISOString())
      .order('like_count', { ascending: false })
      .limit(photoLimit);
    
    // Add exclusions if provided
    if (excludePostIds.length > 0) {
      const exclusionClause = `(${excludePostIds.map(id => `'${id}'`).join(',')})`;
      trendingVideoQuery = trendingVideoQuery.not('id', 'in', exclusionClause);
      trendingPhotoQuery = trendingPhotoQuery.not('id', 'in', exclusionClause);
    }
    
    const [
      { data: trendingVideos },
      { data: trendingPhotos }
    ] = await Promise.all([
      trendingVideoQuery,
      trendingPhotoQuery
    ]);
    
    console.log(`generateColdStartFeed: Got ${(trendingVideos || []).length} videos and ${(trendingPhotos || []).length} photos`);
    
    // If we don't have enough recent content, get all content sorted by engagement
    const totalPosts = (trendingVideos || []).length + (trendingPhotos || []).length;
    if (totalPosts < 5) {
      console.log(`generateColdStartFeed: Not enough recent posts, fetching all content`);
      
      // Get videos and photos separately for fallback
      let fallbackVideoQuery = supabase
        .from('posts')
        .select(`
          id,
          created_at,
          media_url,
          thumbnail_url,
          content,
          file_type,
          like_count,
          comment_count,
          view_count,
          author_id,
          hashtags,
          algorithm_score,
          profiles!posts_author_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('file_type', 'video')
        .order('like_count', { ascending: false })
        .limit(videoLimit);
      
      let fallbackPhotoQuery = supabase
        .from('posts')
        .select(`
          id,
          created_at,
          media_url,
          thumbnail_url,
          content,
          file_type,
          like_count,
          comment_count,
          view_count,
          author_id,
          hashtags,
          algorithm_score,
          profiles!posts_author_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('file_type', 'image')
        .order('like_count', { ascending: false })
        .limit(photoLimit);
      
      if (excludePostIds.length > 0) {
        const exclusionClause = `(${excludePostIds.map(id => `'${id}'`).join(',')})`;
        fallbackVideoQuery = fallbackVideoQuery.not('id', 'in', exclusionClause);
        fallbackPhotoQuery = fallbackPhotoQuery.not('id', 'in', exclusionClause);
      }
      
      const [
        { data: fallbackVideos },
        { data: fallbackPhotos }
      ] = await Promise.all([
        fallbackVideoQuery,
        fallbackPhotoQuery
      ]);
      
      const allFallback = [...(fallbackVideos || []), ...(fallbackPhotos || [])];
      console.log(`generateColdStartFeed: Fallback query returned ${allFallback.length} posts`);
      
      if (allFallback.length > 0) {
        const shuffledFallback = allFallback
          .map(post => ({ ...post, randomScore: Math.random() }))
          .sort((a, b) => {
            const aScore = (a.like_count || 0) * 0.7 + a.randomScore * 0.3;
            const bScore = (b.like_count || 0) * 0.7 + b.randomScore * 0.3;
            return bScore - aScore;
          })
          .map(({ randomScore, ...post }) => post);
        
        return shuffledFallback;
      }
    }
    
    // Combine videos and photos, add randomization
    const allPosts = [...(trendingVideos || []), ...(trendingPhotos || [])];
    const shuffledPosts = allPosts
      .map(post => ({ ...post, randomScore: Math.random() }))
      .sort((a, b) => {
        // Give videos slight priority in mixed sorting
        const videoBonus = a.file_type === 'video' ? 0.1 : 0;
        const videoBonusB = b.file_type === 'video' ? 0.1 : 0;
        const aScore = (a.like_count || 0) * 0.7 + a.randomScore * 0.3 + videoBonus;
        const bScore = (b.like_count || 0) * 0.7 + b.randomScore * 0.3 + videoBonusB;
        return bScore - aScore;
      })
      .map(({ randomScore, ...post }) => post);
    
    console.log(`generateColdStartFeed: Returning ${shuffledPosts.length} posts after processing`);
    return shuffledPosts;
  } catch (error) {
    console.error('Error generating cold start feed:', error);
    return [];
  }
};

// DISABLED: Get list of posts the user has already viewed
// const getUserViewedPosts = async (userId) => {
//   if (!userId) return [];
//   
//   try {
//     const { data } = await supabase
//       .from('user_viewed_posts')
//       .select('post_id')
//       .eq('user_id', userId);
//     
//     return data?.map(row => row.post_id) || [];
//   } catch (error) {
//     console.error('Error fetching viewed posts:', error);
//     return [];
//   }
// };

/**
 * Main feed generation function with cold start detection - prioritize videos but include photos
 */
export const generateFeed = async (userId, limit = 20, excludePostIds = []) => {
  console.log(`generateFeed: Getting feed for userId=${userId}, limit=${limit}`);
  console.log('generateFeed: VIEW TRACKING DISABLED - using simple mixed feed');
  
  try {
    // Split: 80% videos, 20% photos
    const videoLimit = Math.floor(limit * 0.8);
    const photoLimit = Math.floor(limit * 0.2);
    
    // Get recent videos (prioritized)
    const videoQuery = supabase
      .from('posts')
      .select(`
        id,
        created_at,
        media_url,
        thumbnail_url,
        content,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        hashtags,
        algorithm_score,
        profiles!posts_author_id_fkey (
          username,
          avatar_url
        )
      `)
      .eq('file_type', 'video')
      .order('created_at', { ascending: false })
      .limit(videoLimit);
    
    // Get recent photos (smaller portion)
    const photoQuery = supabase
      .from('posts')
      .select(`
        id,
        created_at,
        media_url,
        thumbnail_url,
        content,
        file_type,
        like_count,
        comment_count,
        view_count,
        author_id,
        hashtags,
        algorithm_score,
        profiles!posts_author_id_fkey (
          username,
          avatar_url
        )
      `)
      .eq('file_type', 'image')
      .order('like_count', { ascending: false }) // Photos sorted by engagement
      .limit(photoLimit);
    
    const [
      { data: videos },
      { data: photos }
    ] = await Promise.all([
      videoQuery,
      photoQuery
    ]);
    
    // Combine and shuffle for variety
    const allPosts = [...(videos || []), ...(photos || [])];
    const shuffledPosts = allPosts
      .map(post => ({ ...post, randomScore: Math.random() }))
      .sort((a, b) => {
        // Videos get slight priority + recent content priority
        const videoBonus = a.file_type === 'video' ? 0.2 : 0;
        const videoBonusB = b.file_type === 'video' ? 0.2 : 0;
        const aTimestamp = new Date(a.created_at).getTime();
        const bTimestamp = new Date(b.created_at).getTime();
        const aScore = aTimestamp * 0.6 + a.randomScore * 0.2 + videoBonus;
        const bScore = bTimestamp * 0.6 + b.randomScore * 0.2 + videoBonusB;
        return bScore - aScore;
      })
      .map(({ randomScore, ...post }) => post);
    
    console.log(`generateFeed: Mixed query returned ${(videos || []).length} videos and ${(photos || []).length} photos`);
    return shuffledPosts || [];
  } catch (error) {
    console.error('generateFeed: Error in mixed query:', error);
    return [];
  }
};

// DISABLED: Mark a post as viewed by the user (permanent tracking)
// export const markPostAsViewed = async (userId, postId, viewDurationSeconds = 0) => {
//   if (!userId || !postId) return;
//   
//   try {
//     await supabase
//       .from('user_viewed_posts')
//       .upsert({
//         user_id: userId,
//         post_id: postId,
//         viewed_at: new Date().toISOString(),
//         view_duration_seconds: viewDurationSeconds
//       }, { 
//         onConflict: 'user_id,post_id',
//         ignoreDuplicates: false 
//       });
//     
//     console.log(`Marked post ${postId} as viewed by user ${userId}`);
//   } catch (error) {
//     console.error('Error marking post as viewed:', error);
//   }
// };

/**
 * Track user's feed interactions for algorithm improvement
 */
export const trackFeedInteraction = async (userId, postId, interactionType, metadata = {}) => {
  try {
    await supabase
      .from('user_video_tracking')
      .upsert({
        user_id: userId,
        post_id: postId,
        interaction_type: interactionType, // 'view', 'like', 'comment', 'share', 'skip'
        watch_duration_seconds: metadata.watchDuration || 0,
        completion_percentage: metadata.completionRate || 0,
        session_id: metadata.sessionId || null,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id,post_id' });
    
    console.log(`Tracked ${interactionType} for post ${postId}`);
  } catch (error) {
    console.error('Error tracking feed interaction:', error);
  }
};