// utils/notificationTester.js
import { supabase } from './supabase';
import { triggerPushNotification, createNotification } from './notificationHelpers';
import { initializePushNotifications } from './notificationService';

/**
 * Comprehensive notification system test suite
 */
export class NotificationTester {
  static async runFullDiagnostic() {
    console.log('🧪 =================================');
    console.log('🧪 NOTIFICATION SYSTEM DIAGNOSTIC');
    console.log('🧪 =================================');

    const results = {
      userAuth: false,
      profile: false,
      pushToken: false,
      database: false,
      edgeFunction: false,
      realtimeListener: false,
      overallHealth: 'FAILED'
    };

    try {
      // 1. Test user authentication
      console.log('1️⃣ Testing user authentication...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('❌ User authentication failed:', authError?.message);
        return results;
      }
      results.userAuth = true;
      console.log('✅ User authenticated:', user.email);

      // 2. Test profile existence and push token
      console.log('2️⃣ Testing user profile and push token...');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, push_token')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('❌ Profile fetch failed:', profileError.message);
        return results;
      }
      results.profile = true;
      console.log('✅ Profile exists:', profile.username);

      if (profile.push_token) {
        results.pushToken = true;
        console.log('✅ Push token exists:', profile.push_token.substring(0, 25) + '...');
      } else {
        console.warn('⚠️  No push token found. Attempting to register...');
        const token = await initializePushNotifications();
        if (token) {
          results.pushToken = true;
          console.log('✅ Push token registered successfully');
        } else {
          console.error('❌ Failed to register push token');
        }
      }

      // 3. Test database notification creation
      console.log('3️⃣ Testing database notification creation...');
      const testNotification = await createNotification({
        userId: user.id,
        type: 'test',
        message: 'Diagnostic test notification',
        senderId: user.id
      });

      if (testNotification) {
        results.database = true;
        console.log('✅ Database notification created:', testNotification.id);
      } else {
        console.error('❌ Failed to create database notification');
        return results;
      }

      // 4. Test Edge Function
      console.log('4️⃣ Testing Edge Function push notification...');
      const pushResult = await triggerPushNotification(
        user.id, 
        'test', 
        'Edge Function test notification', 
        testNotification.id
      );

      if (pushResult && pushResult.success) {
        results.edgeFunction = true;
        console.log('✅ Edge Function push notification succeeded');
      } else {
        console.error('❌ Edge Function push notification failed');
      }

      // 5. Test realtime listener (create another notification and see if it triggers)
      console.log('5️⃣ Testing realtime notification listener...');
      let listenerTriggered = false;

      // Set up a temporary listener
      const tempChannel = supabase
        .channel('diagnostic-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('🔔 Realtime listener triggered:', payload.new.id);
            listenerTriggered = true;
          }
        )
        .subscribe();

      // Wait a moment for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create another test notification
      const realtimeTestNotification = await createNotification({
        userId: user.id,
        type: 'test',
        message: 'Realtime listener test notification',
        senderId: user.id
      });

      // Wait for listener to trigger
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (listenerTriggered) {
        results.realtimeListener = true;
        console.log('✅ Realtime listener working');
      } else {
        console.error('❌ Realtime listener not triggered');
      }

      // Clean up temporary channel
      supabase.removeChannel(tempChannel);

      // Calculate overall health
      const passedTests = Object.values(results).filter(v => v === true).length;
      if (passedTests >= 5) {
        results.overallHealth = 'HEALTHY';
      } else if (passedTests >= 3) {
        results.overallHealth = 'PARTIALLY_HEALTHY';
      } else {
        results.overallHealth = 'CRITICAL';
      }

      console.log('🧪 =================================');
      console.log('🧪 DIAGNOSTIC RESULTS:');
      console.log('🧪 =================================');
      console.log(`👤 User Auth: ${results.userAuth ? '✅' : '❌'}`);
      console.log(`🏠 Profile: ${results.profile ? '✅' : '❌'}`);
      console.log(`📱 Push Token: ${results.pushToken ? '✅' : '❌'}`);
      console.log(`💾 Database: ${results.database ? '✅' : '❌'}`);
      console.log(`⚡ Edge Function: ${results.edgeFunction ? '✅' : '❌'}`);
      console.log(`🔔 Realtime: ${results.realtimeListener ? '✅' : '❌'}`);
      console.log(`🩺 Overall Health: ${results.overallHealth}`);
      console.log('🧪 =================================');

      return results;

    } catch (error) {
      console.error('💥 Diagnostic exception:', error);
      return results;
    }
  }

  static async testBasicNotificationFlow(targetUserId = null) {
    console.log('🧪 Testing basic notification flow...');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ No authenticated user for test');
      return false;
    }

    const recipient = targetUserId || user.id;
    
    try {
      // Create a test notification
      const notification = await createNotification({
        userId: recipient,
        type: 'test',
        message: `Test notification from ${user.email}`,
        senderId: user.id
      });

      if (notification) {
        console.log('✅ Test notification created successfully');
        return true;
      } else {
        console.error('❌ Failed to create test notification');
        return false;
      }
    } catch (error) {
      console.error('💥 Exception in basic notification test:', error);
      return false;
    }
  }

  static async checkEdgeFunctionHealth() {
    console.log('🧪 Checking Edge Function health...');
    
    try {
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: { test: true, healthCheck: true }
      });

      if (error) {
        console.error('❌ Edge Function health check failed:', error);
        return false;
      }

      console.log('✅ Edge Function is responsive');
      return true;
    } catch (error) {
      console.error('💥 Exception checking Edge Function health:', error);
      return false;
    }
  }

  static async simulateUserInteraction(interactionType = 'like') {
    console.log(`🧪 Simulating user interaction: ${interactionType}`);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ No authenticated user for simulation');
      return false;
    }

    // Get a random user to notify (someone who isn't the current user)
    const { data: randomUser } = await supabase
      .from('profiles')
      .select('id, username')
      .neq('id', user.id)
      .limit(1)
      .single();

    if (!randomUser) {
      console.log('⚠️  No other users found for simulation, using self');
      return await this.testBasicNotificationFlow(user.id);
    }

    try {
      let message = '';
      let type = '';
      
      switch (interactionType) {
        case 'like':
          message = `@${user.email?.split('@')[0] || 'Someone'} liked your post`;
          type = 'post_like';
          break;
        case 'comment':
          message = `@${user.email?.split('@')[0] || 'Someone'} commented on your post`;
          type = 'post_comment';
          break;
        case 'follow':
          message = `@${user.email?.split('@')[0] || 'Someone'} started following you`;
          type = 'follow';
          break;
        default:
          message = `@${user.email?.split('@')[0] || 'Someone'} interacted with your content`;
          type = 'test';
      }

      const notification = await createNotification({
        userId: randomUser.id,
        type: type,
        message: message,
        senderId: user.id
      });

      if (notification) {
        console.log(`✅ ${interactionType} notification sent to @${randomUser.username}`);
        return true;
      } else {
        console.error(`❌ Failed to send ${interactionType} notification`);
        return false;
      }
    } catch (error) {
      console.error(`💥 Exception simulating ${interactionType}:`, error);
      return false;
    }
  }
}

// Quick access functions
export const runNotificationDiagnostic = () => NotificationTester.runFullDiagnostic();
export const testNotificationFlow = (targetUserId) => NotificationTester.testBasicNotificationFlow(targetUserId);
export const checkEdgeFunctionHealth = () => NotificationTester.checkEdgeFunctionHealth();
export const simulateUserLike = () => NotificationTester.simulateUserInteraction('like');
export const simulateUserComment = () => NotificationTester.simulateUserInteraction('comment');
export const simulateUserFollow = () => NotificationTester.simulateUserInteraction('follow');