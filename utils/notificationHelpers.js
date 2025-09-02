import { supabase } from './supabase';

/**
 * Check for duplicate notifications to prevent spam
 */
async function checkForDuplicateNotification(userId, type, message, relatedUserId, relatedPostId, senderId) {
  try {
    // Define different deduplication timeframes based on notification type
    const dedupeWindows = {
      'direct_message': 30, // 30 seconds for DMs (prevent rapid message spam)
      'post_like': 300, // 5 minutes for likes (prevent button mashing)
      'post_comment': 60, // 1 minute for comments 
      'follow': 3600, // 1 hour for follows (prevents accidental double follows)
      'comment_like': 300, // 5 minutes for comment likes
      'forum_reply': 60, // 1 minute for forum replies
      'forum_like': 300, // 5 minutes for forum likes
      'test': 10, // 10 seconds for test notifications
      'default': 120 // 2 minutes default
    };

    const windowSeconds = dedupeWindows[type] || dedupeWindows['default'];

    // Check for recent similar notifications
    const { data: recentNotifications, error } = await supabase
      .from('notifications')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('message', message)
      .gte('created_at', new Date(Date.now() - windowSeconds * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking for duplicate notifications:', error);
      return { isDuplicate: false };
    }

    if (recentNotifications && recentNotifications.length > 0) {
      const existingNotification = recentNotifications[0];
      const timeDiff = Date.now() - new Date(existingNotification.created_at).getTime();
      
      return {
        isDuplicate: true,
        reason: `Similar ${type} notification sent ${Math.round(timeDiff/1000)}s ago (within ${windowSeconds}s window)`,
        existingNotification: { id: existingNotification.id }
      };
    }

    // Additional check for post-related notifications (same post, same sender, same type)
    if (relatedPostId && senderId) {
      const { data: postRelatedNotifications, error: postError } = await supabase
        .from('notifications')
        .select('id, created_at')
        .eq('user_id', userId)
        .eq('type', type)
        .eq('related_post_id', relatedPostId)
        .eq('sender_id', senderId)
        .gte('created_at', new Date(Date.now() - windowSeconds * 1000).toISOString())
        .limit(1);

      if (!postError && postRelatedNotifications && postRelatedNotifications.length > 0) {
        const existingNotification = postRelatedNotifications[0];
        const timeDiff = Date.now() - new Date(existingNotification.created_at).getTime();
        
        return {
          isDuplicate: true,
          reason: `Similar ${type} notification for same post from same sender ${Math.round(timeDiff/1000)}s ago`,
          existingNotification: { id: existingNotification.id }
        };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Exception checking for duplicate notifications:', error);
    return { isDuplicate: false }; // On error, allow the notification to proceed
  }
}

/**
 * Create a notification record in the database with deduplication
 */
export async function createNotification({
  userId,
  type,
  message,
  relatedUserId = null,
  relatedPostId = null,
  senderId = null
}) {
  try {
    // Check for recent duplicate notifications to prevent spam
    const dedupeResult = await checkForDuplicateNotification(userId, type, message, relatedUserId, relatedPostId, senderId);
    if (dedupeResult.isDuplicate) {
      console.log('⚠️  Skipping duplicate notification:', dedupeResult.reason);
      return dedupeResult.existingNotification;
    }

    const { data: notificationId, error } = await supabase
      .rpc('create_notification_rpc', {
        p_user_id: userId,
        p_type: type,
        p_message: message,
        p_related_user_id: relatedUserId,
        p_related_post_id: relatedPostId,
        p_sender_id: senderId
      });

    if (error) {
      console.error('Error creating notification:', error);
      return null;
    }

    console.log('✅ Created new notification:', notificationId);

    // Trigger push notification via Edge Function
    const pushResult = await triggerPushNotification(userId, type, message, notificationId);
    
    // If Edge Function fails, try direct push notification as fallback
    if (!pushResult) {
      console.log('Edge function failed, attempting direct push notification...');
      await directPushNotification(userId, type, message);
    }
    
    return { id: notificationId };
  } catch (error) {
    console.error('Exception creating notification:', error);
    return null;
  }
}

/**
 * Trigger push notification via Supabase Edge Function
 */
export async function triggerPushNotification(userId, type, message, notificationId) {
  try {
    console.log('📡 [PUSH_NOTIFICATION_DEBUG] Attempting to invoke send-push-notification edge function...');
    console.log('📦 [PUSH_NOTIFICATION_DEBUG] Payload:', { userId, type, message, notificationId });
    
    // Check if user exists and has push token before calling edge function
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, push_token')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('❌ [PUSH_NOTIFICATION_DEBUG] Error fetching user profile:', profileError);
      return null;
    }

    if (!userProfile?.push_token) {
      console.warn('⚠️  [PUSH_NOTIFICATION_DEBUG] User has no push token, skipping edge function call');
      console.log('📋 [PUSH_NOTIFICATION_DEBUG] User profile:', { id: userProfile?.id, username: userProfile?.username, has_token: !!userProfile?.push_token });
      return null;
    }

    console.log('✅ [PUSH_NOTIFICATION_DEBUG] User has valid push token, calling edge function');
    console.log('📋 [PUSH_NOTIFICATION_DEBUG] Token preview:', userProfile.push_token.substring(0, 25) + '...');
    
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        userId,
        type,
        message,
        notificationId
      }
    });

    if (error) {
      console.error('❌ [PUSH_NOTIFICATION_DEBUG] Error triggering push notification via edge function:', error);
      console.error('📋 [PUSH_NOTIFICATION_DEBUG] Error details:', {
        message: error.message,
        status: error.status,
        code: error.code,
        context: error.context
      });
      
      // Log specific error types
      if (error.status === 404) {
        console.error('🚫 [PUSH_NOTIFICATION_DEBUG] Edge function not found - may not be deployed');
      } else if (error.status === 500) {
        console.error('💥 [PUSH_NOTIFICATION_DEBUG] Edge function internal error - check function logs with: supabase functions logs send-push-notification');
      } else if (error.status === 401) {
        console.error('🔐 [PUSH_NOTIFICATION_DEBUG] Authentication error calling edge function');
      } else if (error.status === 403) {
        console.error('🔒 [PUSH_NOTIFICATION_DEBUG] Permission denied - check RLS policies');
      }
      
      return null;
    }
    
    console.log('✅ [PUSH_NOTIFICATION_DEBUG] Push notification edge function response:', data);
    
    // Validate response
    if (data && data.success) {
      console.log('🎯 [PUSH_NOTIFICATION_DEBUG] Edge function reported success');
      return data;
    } else {
      console.error('❌ [PUSH_NOTIFICATION_DEBUG] Edge function completed but reported failure:', data);
      return null;
    }
    
  } catch (error) {
    console.error('💥 [PUSH_NOTIFICATION_DEBUG] Exception triggering push notification:', error);
    console.error('📋 [PUSH_NOTIFICATION_DEBUG] Exception details:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 200) + '...'
    });
    return null;
  }
}

/**
 * Direct push notification fallback (bypasses Edge Function)
 */
export async function directPushNotification(userId, type, message) {
  try {
    console.log('🔄 Attempting direct push notification fallback for user:', userId);
    
    // Get user's push token directly from database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('push_token, username')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('❌ Error fetching profile for direct push:', error);
      console.error('📋 Profile error details:', {
        message: error.message,
        code: error.code,
        hint: error.hint
      });
      return null;
    }

    if (!profile?.push_token) {
      console.log('⚠️  User has no push token for direct push - cannot send notification');
      return null;
    }

    // Validate push token format
    if (!profile.push_token.startsWith('ExponentPushToken[')) {
      console.error('❌ Invalid push token format:', profile.push_token.substring(0, 20) + '...');
      return null;
    }

    console.log('✅ Valid push token found for user:', profile.username || userId);

    // Create push message
    const pushMessage = {
      to: profile.push_token,
      sound: 'default',
      title: getNotificationTitle(type),
      body: message,
      data: { type, userId, timestamp: Date.now() }
    };

    console.log('📤 Sending direct push notification...');
    console.log('📋 Message:', { title: pushMessage.title, body: pushMessage.body });

    // Send directly to Expo push service
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pushMessage),
    });

    if (!response.ok) {
      console.error('❌ Direct push HTTP error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('❌ Error response body:', errorText);
      return null;
    }

    const result = await response.json();
    console.log('📨 Direct push notification result:', result);
    
    // Check for Expo push service errors
    if (result.data && result.data.status === 'error') {
      console.error('❌ Expo push service error:', result.data.message);
      console.error('📋 Error details:', result.data.details);
      return null;
    }
    
    if (result.data && result.data.status === 'ok') {
      console.log('✅ Direct push notification sent successfully!');
      return result;
    }
    
    // Handle array response format
    if (Array.isArray(result) && result.length > 0) {
      const firstResult = result[0];
      if (firstResult.status === 'error') {
        console.error('❌ Expo push service error:', firstResult.message);
        return null;
      } else if (firstResult.status === 'ok') {
        console.log('✅ Direct push notification sent successfully!');
        return result;
      }
    }
    
    console.log('⚠️  Unexpected response format from Expo push service:', result);
    return result;
    
  } catch (error) {
    console.error('💥 Exception in direct push notification:', error);
    console.error('📋 Exception details:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 200) + '...'
    });
    return null;
  }
}

/**
 * Get notification title based on type
 */
function getNotificationTitle(type) {
  switch (type) {
    case 'post_like':
      return 'New Like! ❤️';
    case 'post_comment':
      return 'New Comment! 💬';
    case 'comment_like':
      return 'Comment Liked! ❤️';
    case 'follow':
      return 'New Follower! 👥';
    case 'direct_message':
      return 'New Message! 📩';
    case 'forum_reply':
      return 'Forum Reply! 💬';
    case 'forum_like':
      return 'Forum Like! ❤️';
    case 'test':
      return 'Test Notification! 🧪';
    default:
      return 'Vroom Social Notification! 🚗';
  }
}

/**
 * Send notification when someone likes a post
 */
export async function notifyPostLike(postId, likerId, postOwnerId) {
  if (likerId === postOwnerId) return; // Don't notify self

  try {
    // Get liker username
    const { data: likerProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', likerId)
      .single();

    const message = `@${likerProfile?.username || 'Someone'} liked your post`;

    await createNotification({
      userId: postOwnerId,
      type: 'post_like',
      message,
      relatedUserId: likerId,
      relatedPostId: postId,
      senderId: likerId
    });
  } catch (error) {
    console.error('Error in notifyPostLike:', error);
  }
}

/**
 * Send notification when someone comments on a post
 */
export async function notifyPostComment(postId, commenterId, postOwnerId) {
  if (commenterId === postOwnerId) return; // Don't notify self

  try {
    // Get commenter username
    const { data: commenterProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', commenterId)
      .single();

    const message = `@${commenterProfile?.username || 'Someone'} commented on your post`;

    await createNotification({
      userId: postOwnerId,
      type: 'post_comment',
      message,
      relatedUserId: commenterId,
      relatedPostId: postId,
      senderId: commenterId
    });
  } catch (error) {
    console.error('Error in notifyPostComment:', error);
  }
}

/**
 * Send notification when someone sends a DM
 */
export async function notifyDirectMessage(conversationId, senderId, recipientId, messageText) {
  if (senderId === recipientId) return; // Don't notify self

  try {
    // Get sender username
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', senderId)
      .single();

    const message = `@${senderProfile?.username || 'Someone'} sent you a message`;

    await createNotification({
      userId: recipientId,
      type: 'direct_message',
      message,
      relatedUserId: senderId,
      senderId
    });
  } catch (error) {
    console.error('Error in notifyDirectMessage:', error);
  }
}

/**
 * Send notification when someone replies to a forum post
 */
export async function notifyForumReply(postId, replierId, postOwnerId) {
  if (replierId === postOwnerId) return; // Don't notify self

  try {
    // Get replier username
    const { data: replierProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', replierId)
      .single();

    const message = `@${replierProfile?.username || 'Someone'} replied to your forum post`;

    await createNotification({
      userId: postOwnerId,
      type: 'forum_reply',
      message,
      relatedUserId: replierId,
      relatedPostId: postId,
      senderId: replierId
    });
  } catch (error) {
    console.error('Error in notifyForumReply:', error);
  }
}

/**
 * Send notification when someone likes a forum post
 */
export async function notifyForumLike(postId, likerId, postOwnerId) {
  if (likerId === postOwnerId) return; // Don't notify self

  try {
    // Get liker username
    const { data: likerProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', likerId)
      .single();

    const message = `@${likerProfile?.username || 'Someone'} liked your forum post`;

    await createNotification({
      userId: postOwnerId,
      type: 'forum_like',
      message,
      relatedUserId: likerId,
      relatedPostId: postId,
      senderId: likerId
    });
  } catch (error) {
    console.error('Error in notifyForumLike:', error);
  }
}

/**
 * Send notification when someone follows you
 */
export async function notifyFollow(followerId, followedId) {
  if (followerId === followedId) return; // Don't notify self

  try {
    // Get follower username
    const { data: followerProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', followerId)
      .single();

    const message = `@${followerProfile?.username || 'Someone'} started following you`;

    await createNotification({
      userId: followedId,
      type: 'follow',
      message,
      relatedUserId: followerId,
      senderId: followerId
    });
  } catch (error) {
    console.error('Error in notifyFollow:', error);
  }
}

/**
 * Send notification when someone likes your comment
 */
export async function notifyCommentLike(commentId, likerId, commentOwnerId) {
  if (likerId === commentOwnerId) return; // Don't notify self

  try {
    // Get liker username
    const { data: likerProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', likerId)
      .single();

    const message = `@${likerProfile?.username || 'Someone'} liked your comment`;

    await createNotification({
      userId: commentOwnerId,
      type: 'comment_like',
      message,
      relatedUserId: likerId,
      senderId: likerId
    });
  } catch (error) {
    console.error('Error in notifyCommentLike:', error);
  }
}

/**
 * Test notification function - sends a test notification to the current user
 * This is useful for debugging the entire notification pipeline
 */
export async function sendTestNotification() {
  try {
    console.log('🧪 Starting test notification...');
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('❌ Cannot send test notification - user not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    console.log('✅ User authenticated:', user.id);

    // Check if user has push token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_token, username')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('❌ Error fetching user profile:', profileError);
      return { success: false, error: 'Could not fetch user profile' };
    }

    if (!profile?.push_token) {
      console.error('❌ User has no push token registered');
      return { success: false, error: 'No push token found. Please restart the app to register for notifications.' };
    }

    console.log('✅ User has push token:', profile.push_token.substring(0, 20) + '...');

    // Create test notification
    const testMessage = 'This is a test notification! 🚗 Your notifications are working correctly.';
    
    const result = await createNotification({
      userId: user.id,
      type: 'test',
      message: testMessage,
      senderId: user.id
    });

    if (result) {
      console.log('✅ Test notification sent successfully!');
      return { 
        success: true, 
        message: 'Test notification sent! Check your device for the notification.',
        notificationId: result.id
      };
    } else {
      console.error('❌ Test notification failed to send');
      return { success: false, error: 'Failed to create test notification' };
    }
    
  } catch (error) {
    console.error('❌ Exception in test notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify notification pipeline health
 * Checks all components needed for notifications to work
 */
export async function checkNotificationHealth() {
  const health = {
    userAuthenticated: false,
    profileExists: false,
    pushTokenExists: false,
    pushTokenValid: false,
    edgeFunctionAvailable: false,
    overallHealth: 'unhealthy'
  };

  try {
    console.log('🔍 Checking notification system health...');

    // Check user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (user && !userError) {
      health.userAuthenticated = true;
      console.log('✅ User authenticated');
    } else {
      console.log('❌ User not authenticated');
      return health;
    }

    // Check profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, push_token, username')
      .eq('id', user.id)
      .single();

    if (profile && !profileError) {
      health.profileExists = true;
      console.log('✅ Profile exists');

      // Check push token
      if (profile.push_token) {
        health.pushTokenExists = true;
        console.log('✅ Push token exists');

        // Validate push token format
        if (profile.push_token.startsWith('ExponentPushToken[')) {
          health.pushTokenValid = true;
          console.log('✅ Push token format is valid');
        } else {
          console.log('❌ Push token format is invalid');
        }
      } else {
        console.log('❌ No push token found');
      }
    } else {
      console.log('❌ Profile does not exist');
    }

    // Test edge function availability (basic check)
    try {
      const { error: functionError } = await supabase.functions.invoke('send-push-notification', {
        body: { test: true }
      });
      
      // If it doesn't error immediately, the function exists
      if (!functionError || functionError.status !== 404) {
        health.edgeFunctionAvailable = true;
        console.log('✅ Edge function is available');
      } else {
        console.log('❌ Edge function not available:', functionError);
      }
    } catch (error) {
      console.log('❌ Edge function check failed:', error.message);
    }

    // Determine overall health
    if (health.userAuthenticated && health.profileExists && health.pushTokenExists && health.pushTokenValid) {
      health.overallHealth = health.edgeFunctionAvailable ? 'healthy' : 'partially-healthy';
    } else {
      health.overallHealth = 'unhealthy';
    }

    console.log('📊 Health check complete:', health.overallHealth);
    return health;

  } catch (error) {
    console.error('❌ Exception during health check:', error);
    return health;
  }
}