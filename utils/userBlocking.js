import { Alert } from 'react-native';
import { supabase } from './supabase';

/**
 * Block a user
 * @param {string} blockedUserId - The ID of the user to block
 * @param {string} currentUserId - The ID of the current user
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function blockUser(blockedUserId, currentUserId) {
  try {
    console.log('=== Starting blockUser ===');
    console.log('Blocked User ID:', blockedUserId);
    console.log('Current User ID:', currentUserId);
    
    // Validate inputs
    if (!blockedUserId || !currentUserId) {
      console.error('Missing required parameters: blockedUserId or currentUserId');
      return false;
    }

    if (blockedUserId === currentUserId) {
      console.error('User cannot block themselves');
      Alert.alert('Error', 'You cannot block yourself.');
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
      Alert.alert('Authentication Required', 'Please log in to block users.');
      return false;
    }
    
    if (session.user.id !== currentUserId) {
      console.error('Session user ID mismatch:', { sessionUserId: session.user.id, providedUserId: currentUserId });
      return false;
    }

    // Insert block record
    console.log('Creating block record...');
    const { error: blockError } = await supabase
      .from('user_blocks')
      .insert({
        blocker_id: currentUserId,
        blocked_id: blockedUserId
      });

    if (blockError) {
      console.error('Database error creating block:', blockError);
      if (blockError.code === '23505') { // Unique constraint violation
        Alert.alert('Already Blocked', 'You have already blocked this user.');
        return true; // Consider this a success since the goal is achieved
      }
      console.error('Block error code:', blockError.code);
      console.error('Block error message:', blockError.message);
      return false;
    }

    console.log('User blocked successfully');
    return true;
  } catch (error) {
    console.error('Exception in blockUser:', error);
    console.error('Exception message:', error.message);
    return false;
  }
}

/**
 * Unblock a user
 * @param {string} blockedUserId - The ID of the user to unblock
 * @param {string} currentUserId - The ID of the current user
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function unblockUser(blockedUserId, currentUserId) {
  try {
    console.log('=== Starting unblockUser ===');
    console.log('Blocked User ID:', blockedUserId);
    console.log('Current User ID:', currentUserId);
    
    // Validate inputs
    if (!blockedUserId || !currentUserId) {
      console.error('Missing required parameters: blockedUserId or currentUserId');
      return false;
    }

    // Check current authentication state
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!session || !session.user || session.user.id !== currentUserId) {
      console.error('Authentication failed for unblock');
      return false;
    }

    // Delete block record
    console.log('Removing block record...');
    const { error: unblockError } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', currentUserId)
      .eq('blocked_id', blockedUserId);

    if (unblockError) {
      console.error('Database error removing block:', unblockError);
      return false;
    }

    console.log('User unblocked successfully');
    return true;
  } catch (error) {
    console.error('Exception in unblockUser:', error);
    return false;
  }
}

/**
 * Check if a user is blocked by the current user
 * @param {string} userId - The ID of the user to check
 * @param {string} currentUserId - The ID of the current user
 * @returns {Promise<boolean>} - True if blocked, false otherwise
 */
export async function isUserBlocked(userId, currentUserId) {
  try {
    if (!userId || !currentUserId) {
      return false;
    }

    const { data, error } = await supabase
      .from('user_blocks')
      .select('id')
      .eq('blocker_id', currentUserId)
      .eq('blocked_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking block status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Exception checking block status:', error);
    return false;
  }
}

/**
 * Get list of blocked users
 * @param {string} currentUserId - The ID of the current user
 * @returns {Promise<Array>} - Array of blocked user objects
 */
export async function getBlockedUsers(currentUserId) {
  try {
    if (!currentUserId) {
      return [];
    }

    const { data, error } = await supabase
      .from('user_blocks')
      .select(`
        id,
        blocked_id,
        created_at,
        users:blocked_id (
          id,
          email,
          username,
          profile_picture_url
        )
      `)
      .eq('blocker_id', currentUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching blocked users:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching blocked users:', error);
    return [];
  }
}

/**
 * Show confirmation dialog and block user if confirmed
 * @param {Object} userToBlock - The user object to block
 * @param {string} currentUserId - The current user's ID
 * @param {Function} onSuccess - Callback function called on successful blocking
 */
export function confirmAndBlockUser(userToBlock, currentUserId, onSuccess) {
  // Get a display name, fallback to "this user" if nothing available
  const displayName = userToBlock.username || userToBlock.email || 'this user';
  
  Alert.alert(
    'Block User',
    `Are you sure you want to block ${displayName}? You will no longer see their posts or messages.`,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const success = await blockUser(userToBlock.id, currentUserId);
          if (success) {
            Alert.alert('User Blocked', `${displayName} has been blocked.`);
            onSuccess?.();
          } else {
            Alert.alert('Error', 'Failed to block user. Please try again.');
          }
        },
      },
    ],
    { cancelable: true }
  );
}