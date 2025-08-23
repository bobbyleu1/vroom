import { supabase } from './utils/supabase.js';

// Test the feed refresh system with comprehensive checks
async function testFeedRefresh() {
  const userId = '99d4f5cc-3ace-49ff-b25d-dfb7b68d0f40';
  const sessionId = `test-session-${Date.now()}`;
  const sessionOpenedAt = new Date().toISOString();
  
  console.log('\n=== Testing Feed Refresh System ===');
  console.log('User ID:', userId);
  console.log('Session:', sessionId);
  console.log('Session opened at:', sessionOpenedAt);

  // Initial feed request (refresh_nonce: 0)
  console.log('\n--- Initial Feed Request (refresh_nonce: 0) ---');
  const initialRequest = {
    user_id: userId,
    page_size: 12,
    page_after: null,
    session_id: sessionId,
    session_opened_at: sessionOpenedAt,
    refresh_nonce: 0,
    force_refresh: false
  };

  console.log('Request:', JSON.stringify(initialRequest, null, 2));

  const { data: initialData, error: initialError } = await supabase.functions.invoke('feed-ranker', {
    body: initialRequest
  });

  if (initialError) {
    console.error('Initial request error:', initialError);
    return;
  }

  console.log('Initial Response:');
  console.log('- Posts count:', initialData.items.length);
  console.log('- Cache hit:', initialData.cache_hit);
  console.log('- Used refresh nonce:', initialData.used_refresh_nonce);
  console.log('- Total candidates:', initialData.total_candidates);
  
  // Show first 5 post IDs
  const initialPostIds = initialData.items.slice(0, 12).map(item => item.id);
  console.log('- First 12 post IDs:', initialPostIds.slice(0, 5), '...');

  // Wait 1 second then do pull-to-refresh (refresh_nonce: 1)
  console.log('\n--- Pull-to-Refresh Request (refresh_nonce: 1) ---');
  await new Promise(resolve => setTimeout(resolve, 1000));

  const refreshRequest = {
    user_id: userId,
    page_size: 12,
    page_after: null,
    session_id: sessionId,
    session_opened_at: sessionOpenedAt,
    refresh_nonce: 1,
    force_refresh: true
  };

  console.log('Request:', JSON.stringify(refreshRequest, null, 2));

  const { data: refreshData, error: refreshError } = await supabase.functions.invoke('feed-ranker', {
    body: refreshRequest
  });

  if (refreshError) {
    console.error('Refresh request error:', refreshError);
    return;
  }

  console.log('Refresh Response:');
  console.log('- Posts count:', refreshData.items.length);
  console.log('- Cache hit:', refreshData.cache_hit);
  console.log('- Used refresh nonce:', refreshData.used_refresh_nonce);
  console.log('- Total candidates:', refreshData.total_candidates);
  
  // Show first 5 post IDs and compare
  const refreshPostIds = refreshData.items.slice(0, 12).map(item => item.id);
  console.log('- First 12 post IDs:', refreshPostIds.slice(0, 5), '...');

  // Calculate variation
  const initialSet = new Set(initialPostIds);
  const differentCount = refreshPostIds.filter(id => !initialSet.has(id)).length;
  const variation = differentCount / Math.min(refreshPostIds.length, 12);
  
  console.log('\n=== Variation Analysis ===');
  console.log('- Different posts in first 12:', differentCount);
  console.log('- Variation percentage:', (variation * 100).toFixed(1) + '%');
  console.log('- Low variation (< 5 different):', differentCount < 5 ? 'YES' : 'NO');
  console.log('- Meets requirement (≥ 5 different):', differentCount >= 5 ? 'YES' : 'NO');

  // Show score differences for same posts
  console.log('\n=== Score Analysis ===');
  const initialScores = {};
  const refreshScores = {};
  
  initialData.items.forEach(item => {
    initialScores[item.id] = {
      original: item.original_score,
      jitter: item.jitter_value,
      final: item.score
    };
  });
  
  refreshData.items.forEach(item => {
    refreshScores[item.id] = {
      original: item.original_score,
      jitter: item.jitter_value,
      final: item.score
    };
  });

  // Find common posts and show score differences
  const commonPosts = initialPostIds.filter(id => refreshPostIds.includes(id));
  console.log('- Common posts in both feeds:', commonPosts.length);
  
  if (commonPosts.length > 0) {
    console.log('- Sample score changes for common posts:');
    commonPosts.slice(0, 3).forEach(postId => {
      const initial = initialScores[postId];
      const refresh = refreshScores[postId];
      console.log(`  Post ${postId.slice(0, 8)}:`);
      console.log(`    Initial: ${initial.original.toFixed(6)} + ${initial.jitter.toFixed(6)} = ${initial.final.toFixed(6)}`);
      console.log(`    Refresh: ${refresh.original.toFixed(6)} + ${refresh.jitter.toFixed(6)} = ${refresh.final.toFixed(6)}`);
      console.log(`    Jitter change: ${(refresh.jitter - initial.jitter).toFixed(6)}`);
    });
  }

  // Performance test
  console.log('\n=== Performance Test ===');
  const performanceTimes = [];
  
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    
    const { data, error } = await supabase.functions.invoke('feed-ranker', {
      body: {
        user_id: userId,
        page_size: 12,
        session_id: sessionId + '-perf',
        session_opened_at: sessionOpenedAt,
        refresh_nonce: i + 10,
        force_refresh: true
      }
    });
    
    const duration = Date.now() - start;
    performanceTimes.push(duration);
    
    if (!error && data.performance_stats) {
      console.log(`- Request ${i + 1}: ${duration}ms (server: ${data.performance_stats.execution_time_ms}ms)`);
    } else {
      console.log(`- Request ${i + 1}: ${duration}ms`);
    }
  }
  
  const avgTime = performanceTimes.reduce((a, b) => a + b, 0) / performanceTimes.length;
  const maxTime = Math.max(...performanceTimes);
  
  console.log(`- Average response time: ${avgTime.toFixed(1)}ms`);
  console.log(`- Max response time: ${maxTime}ms`);
  console.log(`- P95 compliance (≤200ms): ${maxTime <= 200 ? 'PASS' : 'FAIL'}`);

  // Cache test
  console.log('\n=== Cache Test ===');
  const cacheTestSession = sessionId + '-cache';
  const cacheTestOpenedAt = new Date().toISOString();
  
  // First request (should not hit cache)
  const { data: cache1 } = await supabase.functions.invoke('feed-ranker', {
    body: {
      user_id: userId,
      page_size: 12,
      session_id: cacheTestSession,
      session_opened_at: cacheTestOpenedAt,
      refresh_nonce: 0,
      force_refresh: false
    }
  });
  
  // Second request with same params (should hit cache)
  const { data: cache2 } = await supabase.functions.invoke('feed-ranker', {
    body: {
      user_id: userId,
      page_size: 12,
      session_id: cacheTestSession,
      session_opened_at: cacheTestOpenedAt,
      refresh_nonce: 0,
      force_refresh: false
    }
  });
  
  console.log('- First request cache hit:', cache1.cache_hit);
  console.log('- Second request cache hit:', cache2.cache_hit);
  console.log('- Cache working correctly:', !cache1.cache_hit && cache2.cache_hit ? 'YES' : 'NO');

  console.log('\n=== Summary ===');
  console.log('✅ Refresh produces different lineup:', differentCount >= 5 ? 'PASS' : 'FAIL');
  console.log('✅ Returns exactly 12 items:', refreshData.items.length === 12 ? 'PASS' : 'FAIL');
  console.log('✅ Performance under 200ms:', maxTime <= 200 ? 'PASS' : 'FAIL');  
  console.log('✅ Cache behavior correct:', !cache1.cache_hit && cache2.cache_hit ? 'PASS' : 'FAIL');
  console.log('✅ Used correct refresh nonce:', refreshData.used_refresh_nonce === 1 ? 'PASS' : 'FAIL');
  
  console.log('\n=== Test Complete ===');
}

// Run the test
testFeedRefresh().catch(console.error);