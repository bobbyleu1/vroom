import { Alert, ActionSheetIOS, Platform } from 'react-native';
import { supabase } from './supabase';

// Standard report reasons for consistency
export const REPORT_REASONS = {
  SPAM: 'Spam',
  HARASSMENT: 'Harassment or Bullying',
  HATE_SPEECH: 'Hate Speech',
  VIOLENCE: 'Violence or Threats',
  INAPPROPRIATE_CONTENT: 'Inappropriate Content',
  COPYRIGHT: 'Copyright Violation',
  MISINFORMATION: 'Misinformation',
  OTHER: 'Other'
};

/**
 * Report a post
 * @param {string} postId - The ID of the post to report
 * @param {string} currentUserId - The ID of the current user reporting
 * @param {string} reason - The reason for reporting (from REPORT_REASONS)
 * @param {string} description - Optional additional description
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function reportPost(postId, currentUserId, reason, description = '') {
  try {
    console.log('=== Starting reportPost ===');
    console.log('Post ID:', postId);
    console.log('Current User ID:', currentUserId);
    console.log('Reason:', reason);
    
    // Validate inputs
    if (!postId || !currentUserId || !reason) {
      console.error('Missing required parameters: postId, currentUserId, or reason');
      return false;
    }

    // Check current authentication state
    console.log('Checking authentication state...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('Session check:', { 
      hasSession: !!session, 
      sessionUserId: session?.user?.id,
      providedUserId: currentUserId,
      sessionError: sessionError?.message 
    });
    
    if (!session || !session.user) {
      console.error('No active session found');
      Alert.alert('Authentication Required', 'Please log in to report posts.');
      return false;
    }
    
    if (session.user.id !== currentUserId) {
      console.error('Session user ID mismatch:', { sessionUserId: session.user.id, providedUserId: currentUserId });
      return false;
    }

    // Check if post exists
    console.log('Verifying post exists...');
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, author_id')
      .eq('id', postId)
      .single();

    if (postError) {
      console.error('Error fetching post:', postError);
      Alert.alert('Error', 'Post not found or has been deleted.');
      return false;
    }

    // Prevent self-reporting
    if (post.author_id === currentUserId) {
      Alert.alert('Error', 'You cannot report your own posts.');
      return false;
    }

    // Insert report record
    console.log('Creating report record...');
    const { error: reportError } = await supabase
      .from('post_reports')
      .insert({
        reporter_id: currentUserId,
        post_id: postId,
        reason: reason,
        description: description.trim() || null,
        status: 'pending'
      });

    if (reportError) {
      console.error('Database error creating report:', reportError);
      if (reportError.code === '23505') { // Unique constraint violation
        Alert.alert('Already Reported', 'You have already reported this post.');
        return true; // Consider this a success since the goal is achieved
      }
      console.error('Report error code:', reportError.code);
      console.error('Report error message:', reportError.message);
      return false;
    }

    console.log('Post reported successfully');
    return true;
  } catch (error) {
    console.error('Exception in reportPost:', error);
    console.error('Exception message:', error.message);
    return false;
  }
}

/**
 * Get user's reports
 * @param {string} currentUserId - The ID of the current user
 * @returns {Promise<Array>} - Array of report objects
 */
export async function getUserReports(currentUserId) {
  try {
    if (!currentUserId) {
      return [];
    }

    const { data, error } = await supabase
      .from('post_reports')
      .select(`
        id,
        reason,
        description,
        status,
        created_at,
        reviewed_at,
        posts:post_id (
          id,
          content,
          media_url,
          thumbnail_url
        )
      `)
      .eq('reporter_id', currentUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user reports:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching user reports:', error);
    return [];
  }
}

/**
 * Show report post dialog with reason selection
 * @param {Object} post - The post object to report
 * @param {string} currentUserId - The current user's ID
 * @param {Function} onSuccess - Callback function called on successful reporting
 */
export function showReportPostDialog(post, currentUserId, onSuccess) {
  // Create options array from REPORT_REASONS
  const reasonOptions = Object.values(REPORT_REASONS);
  const cancelIndex = 0;
  const options = ['Cancel', ...reasonOptions];

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Why are you reporting this post?',
        options: options,
        cancelButtonIndex: cancelIndex,
      },
      (buttonIndex) => {
        if (buttonIndex === cancelIndex) return;
        
        const selectedReason = reasonOptions[buttonIndex - 1];
        
        if (selectedReason === REPORT_REASONS.OTHER) {
          // Show text input for "Other" reason
          Alert.prompt(
            'Report Post',
            'Please describe why you are reporting this post:',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Report',
                style: 'destructive',
                onPress: async (description) => {
                  if (description && description.trim()) {
                    const success = await reportPost(post.id, currentUserId, selectedReason, description);
                    if (success) {
                      Alert.alert('Report Sent', 'Thank you for your report. We will review it shortly.');
                      onSuccess?.();
                    } else {
                      Alert.alert('Error', 'Failed to submit report. Please try again.');
                    }
                  } else {
                    Alert.alert('Error', 'Please provide a description for your report.');
                  }
                }
              }
            ],
            'plain-text'
          );
        } else {
          // Submit report with selected reason
          confirmReport(post, currentUserId, selectedReason, '', onSuccess);
        }
      }
    );
  } else {
    // Android fallback - show simple selection
    Alert.alert(
      'Report Post',
      'Why are you reporting this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        ...reasonOptions.map(reason => ({
          text: reason,
          onPress: () => {
            if (reason === REPORT_REASONS.OTHER) {
              // For Android, ask for description in a separate alert
              Alert.alert(
                'Additional Information',
                'Please describe the issue:',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Submit Report',
                    style: 'destructive',
                    onPress: () => confirmReport(post, currentUserId, reason, 'User provided additional details', onSuccess)
                  }
                ]
              );
            } else {
              confirmReport(post, currentUserId, reason, '', onSuccess);
            }
          }
        }))
      ]
    );
  }
}

/**
 * Confirm and submit report
 * @param {Object} post - The post object to report
 * @param {string} currentUserId - The current user's ID
 * @param {string} reason - The reason for reporting
 * @param {string} description - Additional description
 * @param {Function} onSuccess - Callback function called on successful reporting
 */
async function confirmReport(post, currentUserId, reason, description, onSuccess) {
  const success = await reportPost(post.id, currentUserId, reason, description);
  if (success) {
    Alert.alert('Report Sent', 'Thank you for your report. We will review it shortly.');
    onSuccess?.();
  } else {
    Alert.alert('Error', 'Failed to submit report. Please try again.');
  }
}