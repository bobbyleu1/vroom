import { supabase } from './supabase';

/**
 * Create a notification record in the database
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
    console.log('Attempting to invoke send-push-notification edge function...');
    console.log('Payload:', { userId, type, message, notificationId });
    
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        userId,
        type,
        message,
        notificationId
      }
    });

    if (error) {
      console.error('Error triggering push notification:', error);
      console.error('Error details:', error.message, error.status);
      return null;
    }
    
    console.log('Push notification edge function response:', data);
    return data;
  } catch (error) {
    console.error('Exception triggering push notification:', error);
    console.error('Exception details:', error.message);
    return null;
  }
}

/**
 * Direct push notification fallback (bypasses Edge Function)
 */
export async function directPushNotification(userId, type, message) {
  try {
    console.log('Attempting direct push notification for user:', userId);
    
    // Get user's push token directly from database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('push_token, username')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile for direct push:', error);
      return null;
    }

    if (!profile?.push_token) {
      console.log('User has no push token for direct push');
      return null;
    }

    // Create push message
    const pushMessage = {
      to: profile.push_token,
      sound: 'default',
      title: getNotificationTitle(type),
      body: message,
      data: { type, userId }
    };

    console.log('Sending direct push notification:', pushMessage.title, pushMessage.body);

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

    const result = await response.json();
    console.log('Direct push notification result:', result);
    
    return result;
  } catch (error) {
    console.error('Error in direct push notification:', error);
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
    default:
      return 'Vroom Notification! 🚗';
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