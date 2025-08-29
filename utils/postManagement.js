import { Alert } from 'react-native';
import { supabase } from './supabase';

/**
 * Delete a post and all associated data
 * @param {string} postId - The ID of the post to delete
 * @param {string} userId - The ID of the user requesting deletion
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function deletePost(postId, userId) {
  try {
    console.log('=== Starting deletePost ===');
    console.log('Post ID:', postId);
    console.log('User ID:', userId);
    
    // Validate inputs
    if (!postId || !userId) {
      console.error('Missing required parameters: postId or userId');
      return false;
    }

    // Check current authentication state
    console.log('Checking authentication state...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('Session check:', { 
      hasSession: !!session, 
      sessionUserId: session?.user?.id,
      providedUserId: userId,
      sessionError: sessionError?.message 
    });
    
    if (!session || !session.user) {
      console.error('No active session found');
      return false;
    }
    
    if (session.user.id !== userId) {
      console.error('Session user ID mismatch:', { sessionUserId: session.user.id, providedUserId: userId });
      return false;
    }

    // First, verify the user owns this post
    console.log('Fetching post to verify ownership...');
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('id, author_id, media_url, thumbnail_url')
      .eq('id', postId)
      .eq('author_id', userId)
      .single();

    console.log('Fetch result:', { post, fetchError });

    if (fetchError) {
      console.error('Database error fetching post:', fetchError);
      console.error('Error code:', fetchError?.code);
      console.error('Error message:', fetchError?.message);
      console.error('Error hint:', fetchError?.hint);
      return false;
    }

    if (!post) {
      console.error('Post not found or user does not own this post');
      console.error('PostId:', postId, 'UserId:', userId);
      return false;
    }

    console.log('Ownership verified. Post author_id:', post.author_id, 'Current user:', userId);

    // Delete the post (cascading deletes should handle related data)
    console.log('Attempting to delete post...');
    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('author_id', userId); // Double-check ownership

    if (deleteError) {
      console.error('Database error deleting post:', deleteError);
      console.error('Delete error code:', deleteError?.code);
      console.error('Delete error message:', deleteError?.message);
      console.error('Delete error hint:', deleteError?.hint);
      return false;
    }

    console.log('Post deleted successfully:', postId);
    return true;
  } catch (error) {
    console.error('Exception in deletePost:', error);
    console.error('Exception message:', error.message);
    console.error('Exception stack:', error.stack);
    return false;
  }
}

/**
 * Show confirmation dialog and delete post if confirmed
 * @param {Object} post - The post object to delete
 * @param {string} userId - The current user's ID
 * @param {Function} onSuccess - Callback function called on successful deletion
 */
export function confirmAndDeletePost(post, userId, onSuccess) {
  Alert.alert(
    'Delete Post',
    'Are you sure you want to delete this post? This action cannot be undone.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const success = await deletePost(post.id, userId);
          if (success) {
            Alert.alert('Success', 'Post deleted successfully');
            onSuccess?.();
          } else {
            Alert.alert('Error', 'Failed to delete post. Please try again.');
          }
        },
      },
    ],
    { cancelable: true }
  );
}