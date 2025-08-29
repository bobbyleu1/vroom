# Vroom Feed Algorithm - Complete Implementation Guide

## Overview
TikTok-style infinite scroll feed with Mux video integration, smart content recycling, and native AdMob ads every 10 posts.

## 🎯 Features
- ✅ **Never-ending feed**: Fresh content → Recycled content → Always scrollable
- ✅ **Mux video support**: Full integration with Mux-hosted videos
- ✅ **Smart seen tracking**: Tracks what users have watched with timing
- ✅ **Content recycling**: Shows old content after 7+ days if it has good engagement
- ✅ **Native ads**: AdMob ads every 10 posts that blend seamlessly
- ✅ **Performance optimized**: Efficient queries and mobile-optimized rendering

## 🗄️ Database Schema

### Existing Tables
- `posts`: Contains `mux_playback_id`, `mux_hls_url`, `mux_duration_ms`, etc.
- `profiles`: User profile information

### New Tables
```sql
-- Tracks what users have seen and when
CREATE TABLE seen_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reshown_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);
```

## 🔧 Core Functions

### RPC Functions Created
1. `get_smart_feed(user_uuid, batch_size)` - Main feed algorithm
2. `mark_post_as_seen(user_uuid, post_uuid)` - Track individual views
3. `mark_posts_as_seen_batch(user_uuid, post_uuids[])` - Batch tracking
4. `mark_post_as_reshown(user_uuid, post_uuid)` - Track recycled content

## 📱 React Native Implementation

### Core Manager Class
```javascript
import { VroomFeedManager } from '../utils/vroomFeedManager';

// Get feed with ads included
const result = await VroomFeedManager.getFeed(userId, 30);

// Mark post as seen (happens automatically on scroll)
await VroomFeedManager.markPostAsSeen(userId, postId);

// Refresh feed
const refreshed = await VroomFeedManager.refreshFeed(userId);
```

### Feed Screen Usage
```javascript
// SimpleFeedScreen.js now uses VroomFeedManager
import { VroomFeedManager } from '../utils/vroomFeedManager';

const loadFeed = async () => {
  const result = await VroomFeedManager.getFeed(userId, 20);
  // result.posts already includes ads every 10 items
  setItems(result.posts);
};
```

## 🎥 Video Rendering

### Mux Video URLs
```javascript
// Get HLS stream URL
const videoUrl = VroomFeedManager.getMuxVideoUrl(playbackId);
// Returns: https://stream.mux.com/{playbackId}.m3u8

// Get thumbnail
const thumbnail = VroomFeedManager.getMuxThumbnailUrl(playbackId, {
  width: 640, height: 360, time: 1
});
// Returns: https://image.mux.com/{playbackId}/thumbnail.jpg?width=640&height=360&time=1
```

### VideoCard Component
```javascript
const VideoCard = ({ post, isActive }) => {
  const videoUrl = post.hlsUrl || VroomFeedManager.getMuxVideoUrl(post.playbackId);
  
  return (
    <View style={styles.container}>
      {post.type === 'video' ? (
        <Video
          source={{ uri: videoUrl }}
          shouldPlay={isActive}
          isLooping
          resizeMode="cover"
          style={styles.video}
        />
      ) : (
        <Image source={{ uri: post.mediaUrl }} style={styles.image} />
      )}
      
      {/* User info, engagement buttons, etc. */}
      <View style={styles.overlay}>
        <Text>{post.profiles.username}</Text>
        <Text>{post.content}</Text>
      </View>
    </View>
  );
};
```

## 📊 Ad Integration

### Native AdMob Integration
```javascript
import NativeAdView from 'react-native-google-mobile-ads';

const NativeAdCardFeed = ({ adId }) => (
  <View style={styles.adContainer}>
    <NativeAdView
      adUnitID="ca-app-pub-xxxxx/xxxxx" // Your AdMob unit ID
      style={styles.ad}
      requestOptions={{
        requestNonPersonalizedAdsOnly: false,
      }}
    />
    <Text style={styles.sponsoredLabel}>Sponsored</Text>
  </View>
);

// Ads are automatically inserted every 10 posts by VroomFeedManager
const renderItem = ({ item }) => {
  if (item.type === 'ad') {
    return <NativeAdCardFeed adId={item.adId} />;
  }
  return <VideoCard post={item} />;
};
```

## 🔄 Feed Logic Flow

### Priority System
1. **Fresh Content First**: Shows unseen posts ordered by recency
2. **Smart Recycling**: If fresh content < batch size, adds recycled content
3. **Engagement Filter**: Only recycles content with views > 10 OR likes > 2
4. **Time Limits**: Only recycles content seen > 7 days ago
5. **Reshow Limiting**: Won't reshow recycled content reshown < 3 days ago

### Content Types Supported
```javascript
// Feed items have these types:
{
  type: 'video',    // Mux-hosted video
  type: 'image',    // Static image
  type: 'ad',       // AdMob native ad
  
  // Additional properties:
  playbackId: 'abc123',           // Mux playback ID
  hlsUrl: 'https://stream.mux...', // Direct HLS URL
  duration: 30000,                // Video duration in ms
  is_recycled: true,              // Whether this is recycled content
  engagement_score: 45.2          // Calculated engagement score
}
```

## ⚡ Performance Optimizations

### Database Indexes
```sql
CREATE INDEX idx_seen_posts_user_id ON seen_posts(user_id);
CREATE INDEX idx_seen_posts_seen_at ON seen_posts(seen_at);
CREATE INDEX idx_seen_posts_user_seen ON seen_posts(user_id, seen_at);
```

### React Native Optimizations
```javascript
// FlatList optimizations in SimpleFeedScreen
<FlatList
  removeClippedSubviews={true}
  initialNumToRender={3}
  maxToRenderPerBatch={2}
  windowSize={5}
  getItemLayout={(data, index) => ({
    length: height,
    offset: height * index,
    index,
  })}
  // ... other props
/>
```

## 🧪 Testing the System

### Test Fresh Content
1. Upload new posts to test fresh content priority
2. Verify ads appear every 10 posts
3. Check seen tracking works

### Test Content Recycling
1. View all available content (simulate empty fresh content)
2. Wait 7+ days OR manually update `seen_at` timestamps
3. Verify old content reappears with `is_recycled: true`

### Test Edge Cases
1. No content available (new user)
2. All content seen recently (< 7 days)
3. Low engagement content (should not recycle)

## 🚀 Deployment Checklist

- [ ] Supabase migrations applied (`seen_posts` table + RPC functions)
- [ ] RLS policies enabled and tested
- [ ] AdMob account configured with proper ad unit IDs
- [ ] Mux integration tested with real playback IDs
- [ ] Feed performance tested with large datasets
- [ ] Real-time updates working for new posts
- [ ] Error handling implemented for network failures

## 📈 Monitoring & Analytics

### Key Metrics to Track
- Feed load times
- Content recycling rate (% recycled vs fresh)
- Ad impression rates
- Video completion rates
- User engagement with recycled content

### Logging
The system includes comprehensive console logging:
- `[VROOM FEED]` prefix for all feed operations
- Tracks fresh vs recycled content ratios
- Monitors ad insertion
- Logs seen post tracking

This implementation ensures users never run out of content while maintaining optimal performance and engagement!