import { supabase } from './supabase';

class PersonalizedFeedManager {
  constructor() {
    this.currentSession = null;
    this.sessionOpenedAt = null;
    this.refreshNonce = 0;
    this.impressionQueue = [];
    this.batchTimeout = null;
    this.viewStartTimes = new Map();
  }

  // Start a new feed session for the user
  async startSession(userId, forceNew = false) {
    try {
      if (forceNew || !this.currentSession) {
        // Generate new session
        this.currentSession = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.sessionOpenedAt = new Date().toISOString();
        this.refreshNonce = 0;
        console.log('PersonalizedFeed: New session started:', this.currentSession, 'at:', this.sessionOpenedAt);
      }
      return this.currentSession;
    } catch (error) {
      console.error('PersonalizedFeed: Error starting session:', error);
      
      // Fallback session ID if server call fails
      this.currentSession = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.sessionOpenedAt = new Date().toISOString();
      this.refreshNonce = 0;
      return this.currentSession;
    }
  }

  // Increment refresh nonce for pull-to-refresh
  incrementRefreshNonce() {
    this.refreshNonce += 1;
    console.log('PersonalizedFeed: Incremented refresh nonce to:', this.refreshNonce);
    return this.refreshNonce;
  }

  // Get personalized feed using the new TikTok-style feed ranker
  async getPersonalizedFeed(userId, limit = 20, pageAfter = null, options = {}) {
    try {
      const { 
        forceRefresh = false, 
        sessionId = null, 
        sessionOpenedAt = null, 
        refreshNonce = null 
      } = options;
      
      // Use provided session data or fallback to internal state
      const useSessionId = sessionId || this.currentSession;
      const useSessionOpenedAt = sessionOpenedAt || this.sessionOpenedAt;
      const useRefreshNonce = refreshNonce !== null ? refreshNonce : this.refreshNonce;
      
      // Initialize session if not provided and not available
      if (!useSessionId || !useSessionOpenedAt) {
        await this.startSession(userId);
      }

      const requestBody = {
        user_id: userId,
        page_size: limit,
        page_after: pageAfter,
        session_id: useSessionId || this.currentSession,
        session_opened_at: useSessionOpenedAt || this.sessionOpenedAt,
        refresh_nonce: useRefreshNonce,
        force_refresh: forceRefresh
      };

      console.log('PersonalizedFeed: Requesting feed with:', requestBody);

      const { data, error } = await supabase.functions.invoke('feed-ranker', {
        body: requestBody
      });

      if (error) {
        console.error('PersonalizedFeed: Edge function error:', error);
        throw error;
      }

      if (data?.items) {
        console.log('PersonalizedFeed: Received', data.items.length, 'posts', 
          data.cache_hit ? '(cached)' : '', 
          'refresh_nonce:', data.used_refresh_nonce);
        return {
          posts: data.items || [],
          nextPageAfter: data.next_page_after,
          totalCandidates: data.total_candidates || 0,
          cacheHit: data.cache_hit || false,
          usedRefreshNonce: data.used_refresh_nonce
        };
      }

      throw new Error('Feed ranker request failed');
    } catch (error) {
      console.error('PersonalizedFeed: Error getting feed:', error);
      return { posts: [], nextPageAfter: null, totalCandidates: 0, cacheHit: false, usedRefreshNonce: this.refreshNonce };
    }
  }

  // Record impression when video becomes visible (simplified for new system)
  recordImpression(userId, postId, source = 'personalized', watchDurationMs = 0) {
    if (!this.currentSession) {
      console.warn('PersonalizedFeed: No active session for impression');
      return;
    }

    const impression = {
      user_id: userId,
      post_id: postId,
      session_id: this.currentSession,
      source: source,
      watch_duration_ms: watchDurationMs,
      timestamp: Date.now()
    };

    this.impressionQueue.push(impression);
    this.scheduleBatchSend();
  }

  // Start tracking view time for a post
  startViewTracking(postId) {
    this.viewStartTimes.set(postId, Date.now());
  }

  // End tracking and record final impression
  endViewTracking(userId, postId, impressionType = 'view') {
    const startTime = this.viewStartTimes.get(postId);
    if (startTime) {
      const watchDuration = Date.now() - startTime;
      this.recordImpression(userId, postId, impressionType, watchDuration);
      this.viewStartTimes.delete(postId);
      return watchDuration;
    }
    return 0;
  }

  // Record engagement signals (likes, comments, shares)
  async recordEngagementSignal(userId, postId, signalType, signalStrength = 1.0) {
    try {
      const { error } = await supabase
        .from('user_engagement_signals')
        .insert({
          user_id: userId,
          post_id: postId,
          signal_type: signalType,
          signal_strength: signalStrength
        });

      if (error) {
        console.error('PersonalizedFeed: Error recording engagement signal:', error);
      } else {
        console.log('PersonalizedFeed: Engagement signal recorded:', signalType, postId);
      }
    } catch (error) {
      console.error('PersonalizedFeed: Error recording engagement signal:', error);
    }
  }

  // Batch send impressions to reduce API calls
  scheduleBatchSend() {
    if (this.batchTimeout) return;

    this.batchTimeout = setTimeout(() => {
      this.sendImpressionBatch();
      this.batchTimeout = null;
    }, 2000); // Send batch every 2 seconds
  }

  async sendImpressionBatch() {
    if (this.impressionQueue.length === 0) return;

    const batch = [...this.impressionQueue];
    this.impressionQueue = [];

    try {
      // Send impressions using the new database function
      for (const impression of batch) {
        const { error } = await supabase.rpc('record_impression', {
          user_id: impression.user_id,
          post_id: impression.post_id,
          source: impression.source,
          score: null,
          session_id: impression.session_id,
          visible_at: new Date(impression.timestamp).toISOString()
        });

        if (error) {
          console.error('PersonalizedFeed: Error recording impression:', error);
        }
      }

      console.log('PersonalizedFeed: Sent batch of', batch.length, 'impressions');
    } catch (error) {
      console.error('PersonalizedFeed: Error sending impression batch:', error);
      // Re-queue failed impressions
      this.impressionQueue.unshift(...batch);
    }
  }

  // Force send any pending impressions
  async flushImpressions() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    await this.sendImpressionBatch();
  }

  // Update user preferences
  async updateUserPreferences(userId, preferences) {
    try {
      const { error } = await supabase
        .from('user_feed_preferences')
        .upsert({
          user_id: userId,
          ...preferences,
          last_updated: new Date().toISOString()
        });

      if (error) {
        console.error('PersonalizedFeed: Error updating preferences:', error);
      } else {
        console.log('PersonalizedFeed: User preferences updated');
      }
    } catch (error) {
      console.error('PersonalizedFeed: Error updating preferences:', error);
    }
  }

  // Helper to determine time of day
  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  // Clean up when component unmounts
  cleanup() {
    this.flushImpressions();
    this.viewStartTimes.clear();
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
  }
}

// Export singleton instance
export const personalizedFeed = new PersonalizedFeedManager();

// Convenience functions
export const getPersonalizedFeed = (userId, limit, offset, context) => 
  personalizedFeed.getPersonalizedFeed(userId, limit, offset, context);

export const recordVideoImpression = (userId, postId, impressionType, watchDurationMs) =>
  personalizedFeed.recordImpression(userId, postId, impressionType, watchDurationMs);

export const recordEngagement = (userId, postId, signalType, signalStrength) =>
  personalizedFeed.recordEngagementSignal(userId, postId, signalType, signalStrength);

export const startVideoView = (postId) =>
  personalizedFeed.startViewTracking(postId);

export const endVideoView = (userId, postId, impressionType) =>
  personalizedFeed.endViewTracking(userId, postId, impressionType);

export const updateFeedPreferences = (userId, preferences) =>
  personalizedFeed.updateUserPreferences(userId, preferences);