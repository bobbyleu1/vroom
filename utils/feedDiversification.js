// feedDiversification.js
// Utility functions to improve feed diversity by spacing out posts from the same authors

/**
 * Diversify a feed by spacing out posts from the same author
 * @param {Array} posts - Array of post objects with author_id field
 * @param {number} minSpacing - Minimum number of posts between same author (default: 3)
 * @returns {Array} Diversified array of posts
 */
export function diversifyFeedByAuthor(posts, minSpacing = 3) {
  if (!posts || posts.length <= 1) return posts;
  
  const diversified = [];
  const authorLastSeen = new Map(); // Track last position of each author
  const pendingPosts = [...posts]; // Copy of posts to work with
  
  console.log(`Feed diversification: Processing ${posts.length} posts with min spacing ${minSpacing}`);
  
  while (pendingPosts.length > 0) {
    let foundPost = false;
    
    // Try to find a post that respects the spacing rule
    for (let i = 0; i < pendingPosts.length; i++) {
      const post = pendingPosts[i];
      const authorId = post.author_id;
      const currentPosition = diversified.length;
      const authorLastPosition = authorLastSeen.get(authorId) || -minSpacing - 1;
      
      // Check if enough posts have passed since this author's last post
      if (currentPosition - authorLastPosition >= minSpacing) {
        // Add this post to diversified feed
        diversified.push(post);
        authorLastSeen.set(authorId, currentPosition);
        pendingPosts.splice(i, 1);
        foundPost = true;
        break;
      }
    }
    
    // If no post respects the spacing rule, take the first one to avoid infinite loop
    if (!foundPost && pendingPosts.length > 0) {
      console.log('Feed diversification: Taking first pending post to avoid deadlock');
      const post = pendingPosts[0];
      diversified.push(post);
      authorLastSeen.set(post.author_id, diversified.length - 1);
      pendingPosts.splice(0, 1);
    }
  }
  
  // Log diversification stats
  const authorCounts = {};
  diversified.forEach(post => {
    authorCounts[post.author_id] = (authorCounts[post.author_id] || 0) + 1;
  });
  
  const duplicateAuthors = Object.entries(authorCounts)
    .filter(([, count]) => count > 1)
    .length;
    
  console.log(`Feed diversification: ${duplicateAuthors} authors have multiple posts, checking spacing...`);
  
  // Verify spacing (for debugging)
  const violations = [];
  for (let i = 1; i < diversified.length; i++) {
    const currentAuthor = diversified[i].author_id;
    for (let j = Math.max(0, i - minSpacing); j < i; j++) {
      if (diversified[j].author_id === currentAuthor) {
        violations.push({
          author: currentAuthor,
          positions: [j, i],
          spacing: i - j
        });
        break;
      }
    }
  }
  
  if (violations.length > 0) {
    console.log(`Feed diversification: ${violations.length} spacing violations found:`, violations);
  } else {
    console.log('Feed diversification: All posts properly spaced');
  }
  
  return diversified;
}

/**
 * Simple shuffle with author diversity constraint
 * @param {Array} posts - Array of post objects
 * @param {number} minSpacing - Minimum spacing between same authors
 * @returns {Array} Shuffled and diversified posts
 */
export function shuffleWithDiversity(posts, minSpacing = 3) {
  // First shuffle randomly
  const shuffled = [...posts].sort(() => Math.random() - 0.5);
  
  // Then apply diversity filter
  return diversifyFeedByAuthor(shuffled, minSpacing);
}

/**
 * Apply diversity filter only if there are too many consecutive posts from same author
 * @param {Array} posts - Array of post objects
 * @param {number} maxConsecutive - Maximum consecutive posts from same author before intervention
 * @returns {Array} Conditionally diversified posts
 */
export function conditionallyDiversifyFeed(posts, maxConsecutive = 2) {
  if (!posts || posts.length <= 1) return posts;
  
  // Check if we have consecutive posts from same author exceeding threshold
  let needsDiversification = false;
  let consecutiveCount = 1;
  
  for (let i = 1; i < posts.length; i++) {
    if (posts[i].author_id === posts[i - 1].author_id) {
      consecutiveCount++;
      if (consecutiveCount > maxConsecutive) {
        needsDiversification = true;
        break;
      }
    } else {
      consecutiveCount = 1;
    }
  }
  
  if (needsDiversification) {
    console.log(`Feed has consecutive posts from same author, applying diversification...`);
    return diversifyFeedByAuthor(posts, 2); // More lenient spacing for auto-correction
  }
  
  return posts;
}