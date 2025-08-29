import { generateFeed, trackFeedInteraction } from './feedAlgorithm';

/**
 * Example demonstration of the feed algorithm
 */
export const demonstrateAlgorithm = async () => {
  console.log('=== Vroom Feed Algorithm Demo ===');
  
  // Example: Get feed for a test user
  const testUserId = 'b31ed4a4-90e0-4f89-b4b9-74ff02c5a9f3';
  
  try {
    const feed = await generateFeed(testUserId, 10);
    
    console.log(`\nGenerated feed for user ${testUserId}:`);
    console.log(`Total posts: ${feed.length}`);
    
    feed.forEach((post, index) => {
      const scores = post.scores || {};
      console.log(`\n${index + 1}. Post ${post.id.slice(0, 8)}...`);
      console.log(`   Author: ${post.profiles?.username || 'Unknown'}`);
      console.log(`   Content: ${post.content?.slice(0, 50) || 'No content'}...`);
      console.log(`   Engagement: ${post.like_count} likes, ${post.comment_count} comments, ${post.view_count} views`);
      console.log(`   Scores: R=${scores.relevance?.toFixed(2)} E=${scores.engagement?.toFixed(2)} F=${scores.freshness?.toFixed(2)} Final=${scores.final?.toFixed(3)}`);
    });
    
    // Example: Track a user interaction
    if (feed.length > 0) {
      const firstPost = feed[0];
      await trackFeedInteraction(testUserId, firstPost.id, 'view', {
        watchDuration: 15, // 15 seconds
        completionRate: 0.75, // 75% completion
        sessionId: 'demo-session-123'
      });
      console.log(`\nTracked view interaction for post ${firstPost.id}`);
    }
    
    return feed;
    
  } catch (error) {
    console.error('Demo failed:', error);
    return [];
  }
};

/**
 * Example input/output for documentation
 */
export const exampleInputOutput = {
  input: {
    userId: 'user-123',
    userConnections: {
      friends: ['friend-1', 'friend-2'],
      groups: ['cars-group', 'bmw-group'],
      interactions: {
        liked_hashtags: ['#bmw', '#turbo', '#modified'],
        viewed_authors: { 'author-1': 5, 'author-2': 3 }
      }
    },
    candidatePosts: [
      {
        id: 'post-1',
        author_id: 'friend-1', // Friend's post
        like_count: 50,
        view_count: 1000,
        comment_count: 5,
        created_at: '2025-08-21T10:00:00Z', // 6 hours ago
        hashtags: ['#bmw', '#turbo']
      },
      {
        id: 'post-2', 
        author_id: 'random-user',
        like_count: 200,
        view_count: 5000,
        comment_count: 30,
        created_at: '2025-08-20T10:00:00Z', // 30 hours ago
        hashtags: ['#ferrari']
      }
    ]
  },
  output: {
    rankedFeed: [
      {
        id: 'post-1',
        scores: {
          relevance: 0.9,    // High - friend's post + matching hashtags
          engagement: 0.4,   // Medium - 5% like rate
          freshness: 0.96,   // High - very recent
          diversity_penalty: 0.0, // No penalty
          final: 0.716       // (0.9*0.4 + 0.4*0.3 + 0.96*0.2 + 0.0*0.1)
        }
      },
      {
        id: 'post-2',
        scores: {
          relevance: 0.1,    // Low - no connection
          engagement: 0.8,   // High - 4% like rate + comments
          freshness: 0.82,   // Good - 30 hours old
          diversity_penalty: 0.0,
          final: 0.448       // Lower than post-1 despite better engagement
        }
      }
    ]
  }
};