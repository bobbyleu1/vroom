import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationRequest {
  userId: string;
  type: string;
  message: string;
  notificationId?: string;
}

interface PushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create supabase client with the service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { userId, type, message, notificationId }: NotificationRequest = await req.json()

    console.log('Push notification request:', { userId, type, message, notificationId })

    // Get user's push token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_token, username')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!profile?.push_token) {
      console.log('User has no push token, skipping notification')
      return new Response(
        JSON.stringify({ message: 'User has no push token' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create the push message
    const pushMessage: PushMessage = {
      to: profile.push_token,
      sound: 'default',
      title: getNotificationTitle(type),
      body: message,
      data: {
        type,
        notificationId,
        userId,
      }
    }

    console.log('Sending push notification:', pushMessage)

    // Send the push notification via Expo's push service
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pushMessage),
    })

    const result = await response.json()
    console.log('Expo push service response:', result)

    if (result.data?.[0]?.status === 'error') {
      console.error('Push notification error:', result.data[0].details)
      return new Response(
        JSON.stringify({ error: 'Push notification failed', details: result.data[0].details }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Push notification sent successfully',
        expoPushResult: result
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Exception in send-push-notification:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function getNotificationTitle(type: string): string {
  switch (type) {
    case 'post_like':
      return 'New Like! ❤️'
    case 'post_comment':
      return 'New Comment! 💬'
    case 'comment_like':
      return 'Comment Liked! ❤️'
    case 'follow':
      return 'New Follower! 👥'
    case 'direct_message':
      return 'New Message! 📩'
    case 'forum_reply':
      return 'Forum Reply! 💬'
    case 'forum_like':
      return 'Forum Like! ❤️'
    default:
      return 'Vroom Notification! 🚗'
  }
}