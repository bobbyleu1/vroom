import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, mux-signature',
}

interface MuxWebhookEvent {
  type: string
  created_at: string
  data: {
    id: string
    status?: string
    playback_ids?: Array<{
      id: string
      policy: string
    }>
    duration?: number
    max_resolution?: string
    aspect_ratio?: string
    frame_rate?: number
    tracks?: Array<{
      type: string
      duration?: number
    }>
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use service role for webhooks
    )

    // Parse the webhook event
    const webhookEvent: MuxWebhookEvent = await req.json()
    console.log('Received Mux webhook:', webhookEvent.type, 'for asset:', webhookEvent.data.id)

    // Handle different webhook event types
    switch (webhookEvent.type) {
      case 'video.upload.asset_created':
        await handleUploadAssetCreated(supabaseClient, webhookEvent)
        break
      
      case 'video.asset.ready':
        await handleAssetReady(supabaseClient, webhookEvent)
        break
      
      case 'video.asset.errored':
        await handleAssetErrored(supabaseClient, webhookEvent)
        break
      
      default:
        console.log('Unhandled webhook event type:', webhookEvent.type)
    }

    return new Response(
      JSON.stringify({ status: 'success' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error processing Mux webhook:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        status: 'error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

async function handleUploadAssetCreated(supabaseClient: any, event: MuxWebhookEvent) {
  const assetId = event.data.id
  console.log('Asset created:', assetId)

  // Find the post by upload asset ID and update with Mux asset ID
  const { data: posts, error: findError } = await supabaseClient
    .from('posts')
    .select('id, mux_upload_id')
    .not('mux_upload_id', 'is', null)
    .eq('mux_status', 'upload_created')

  if (findError) {
    console.error('Error finding post for asset:', findError)
    return
  }

  // For now, associate with the most recent upload
  // In production, you'd want a more robust mapping system
  const recentPost = posts?.[0]
  if (!recentPost) {
    console.warn('No matching post found for asset:', assetId)
    return
  }

  const { error: updateError } = await supabaseClient
    .from('posts')
    .update({
      mux_asset_id: assetId,
      mux_status: 'processing'
    })
    .eq('id', recentPost.id)

  if (updateError) {
    console.error('Error updating post with asset ID:', updateError)
  } else {
    console.log('Post updated with Mux asset ID:', assetId)
  }
}

async function handleAssetReady(supabaseClient: any, event: MuxWebhookEvent) {
  const assetId = event.data.id
  const assetData = event.data
  
  console.log('Asset ready:', assetId, 'with playback IDs:', assetData.playback_ids)

  // Find the post with this asset ID
  const { data: post, error: findError } = await supabaseClient
    .from('posts')
    .select('id')
    .eq('mux_asset_id', assetId)
    .single()

  if (findError || !post) {
    console.error('Post not found for asset:', assetId, findError)
    return
  }

  // Get the public playback ID
  const publicPlaybackId = assetData.playback_ids?.find(p => p.policy === 'public')?.id

  if (!publicPlaybackId) {
    console.error('No public playback ID found for asset:', assetId)
    return
  }

  // Update the post with playback information
  const updateData = {
    mux_playback_id: publicPlaybackId,
    mux_hls_url: `https://stream.mux.com/${publicPlaybackId}.m3u8`,
    mux_ready: true,
    mux_status: 'ready',
    mux_duration_ms: assetData.duration ? Math.round(assetData.duration * 1000) : null,
    mux_max_resolution: assetData.max_resolution || null,
    mux_aspect_ratio: assetData.aspect_ratio || null,
    mux_frame_rate: assetData.frame_rate || null,
  }

  const { error: updateError } = await supabaseClient
    .from('posts')
    .update(updateData)
    .eq('id', post.id)

  if (updateError) {
    console.error('Error updating post with playback info:', updateError)
  } else {
    console.log('Post updated with Mux playback info:', post.id)
    
    // Generate thumbnail URL using Mux's thumbnail service
    const thumbnailUrl = `https://image.mux.com/${publicPlaybackId}/thumbnail.jpg?width=640&height=360&time=1`
    
    // Update thumbnail if not already set
    const { error: thumbnailError } = await supabaseClient
      .from('posts')
      .update({ thumbnail_url: thumbnailUrl })
      .eq('id', post.id)
      .is('thumbnail_url', null)

    if (thumbnailError) {
      console.error('Error updating thumbnail:', thumbnailError)
    }
  }
}

async function handleAssetErrored(supabaseClient: any, event: MuxWebhookEvent) {
  const assetId = event.data.id
  console.error('Asset processing failed:', assetId)

  // Find and update the post
  const { error: updateError } = await supabaseClient
    .from('posts')
    .update({
      mux_status: 'error',
      mux_error: event.data
    })
    .eq('mux_asset_id', assetId)

  if (updateError) {
    console.error('Error updating post with error status:', updateError)
  }
}