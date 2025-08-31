import { createNotification } from './utils/notificationHelpers.js';
import { supabase } from './utils/supabase.js';

async function testNotification() {
  try {
    console.log('🧪 Testing push notification system...');
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('❌ No authenticated user');
      return;
    }
    
    console.log('👤 Current user:', user.id);
    
    // Check if user has push token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_token, username')
      .eq('id', user.id)
      .single();
      
    if (profileError) {
      console.error('❌ Error getting profile:', profileError);
      return;
    }
    
    console.log('📱 User profile:', {
      username: profile.username,
      hasPushToken: !!profile.push_token,
      tokenLength: profile.push_token?.length
    });
    
    if (!profile.push_token) {
      console.error('❌ User has no push token - notifications cannot be sent');
      return;
    }
    
    // Test notification
    console.log('📤 Sending test notification...');
    const result = await createNotification({
      userId: user.id,
      type: 'test',
      message: 'This is a test notification from the debugging script!'
    });
    
    if (result) {
      console.log('✅ Test notification created:', result);
    } else {
      console.error('❌ Failed to create test notification');
    }
    
  } catch (error) {
    console.error('💥 Test failed with exception:', error);
  }
}

testNotification();