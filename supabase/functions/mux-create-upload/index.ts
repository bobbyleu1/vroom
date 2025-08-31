import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MuxUpload {
  id: string
  url: string
  status: string
  timeout: number
}

interface MuxAsset {
  id: string
  status: string
  playback_ids?: Array<{
    id: string
    policy: string
  }>
  duration?: number
  max_resolution?: string
  aspect_ratio?: string
  frame_rate?: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) {
      throw new Error('Invalid user token')
    }

    const { postId, userId } = await req.json()
    
    if (!postId || !userId) {
      throw new Error('Missing postId or userId')
    }

    // Verify the user owns this post or has permission
    const { data: post, error: postError } = await supabaseClient
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      throw new Error('Post not found')
    }

    if (post.author_id !== userId) {
      throw new Error('Unauthorized: You can only upload videos to your own posts')
    }

    // Get Mux credentials from environment
    const muxTokenId = Deno.env.get('MUX_TOKEN_ID')
    const muxTokenSecret = Deno.env.get('MUX_TOKEN_SECRET')
    
    if (!muxTokenId || !muxTokenSecret) {
      throw new Error('Mux credentials not configured')
    }

    console.log('Creating Mux direct upload for post:', postId, 'user:', userId)

    // Create Mux direct upload
    const muxResponse = await fetch('https://api.mux.com/video/v1/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(muxTokenId + ':' + muxTokenSecret)}`
      },
      body: JSON.stringify({
        cors_origin: '*', // Allow uploads from any origin
        new_asset_settings: {
          playback_policy: ['public'],
          normalize_audio: true,
          // Generate MP4 support for better compatibility
          mp4_support: 'standard'
        }
      })
    })

    if (!muxResponse.ok) {
      const errorText = await muxResponse.text()
      console.error('Mux upload creation failed:', muxResponse.status, errorText)
      throw new Error(`Failed to create Mux upload: ${muxResponse.status} ${errorText}`)
    }

    const uploadData: MuxUpload = await muxResponse.json()
    console.log('Mux upload created:', uploadData.id)

    // Store the upload ID in the database
    const { error: updateError } = await supabaseClient
      .from('posts')
      .update({
        mux_upload_id: uploadData.id,
        mux_status: 'upload_created',
        file_type: 'video'
      })
      .eq('id', postId)

    if (updateError) {
      console.error('Failed to update post with upload ID:', updateError)
      // Don't fail the request, but log the error
    }

    // Set up webhook handling for when upload completes
    // The webhook will be handled by a separate function
    console.log('Upload URL created, post updated with upload ID')

    return new Response(
      JSON.stringify({
        uploadUrl: uploadData.url,
        uploadId: uploadData.id,
        status: 'success'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error in mux-create-upload:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        status: 'error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})