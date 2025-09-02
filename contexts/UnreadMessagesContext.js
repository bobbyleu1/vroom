// contexts/UnreadMessagesContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

const UnreadMessagesContext = createContext();

export const UnreadMessagesProvider = ({ children }) => {
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Initialize user and start monitoring unread messages
  useEffect(() => {
    const initializeUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        await fetchUnreadCount(user.id);
        subscribeToMessagesUpdates(user.id);
      }
    };

    initializeUser();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setCurrentUserId(session.user.id);
        await fetchUnreadCount(session.user.id);
        subscribeToMessagesUpdates(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUserId(null);
        setTotalUnreadCount(0);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Fetch total unread messages count - optimized for speed
  const fetchUnreadCount = async (userId) => {
    if (!userId) return;

    try {
      // Optimize: Single query to count unread messages directly
      // Using a more efficient approach - count messages where user is recipient and unread
      const { count, error: countError } = await supabase
        .from('dm_messages')
        .select('*', { count: 'exact', head: true })
        .neq('sender_id', userId) // Messages not sent by current user
        .eq('is_read', false)      // That are unread
        .in('conversation_id', 
          supabase
            .from('dm_conversations_with_participants')
            .select('id')
            .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        );

      if (countError) {
        console.error('Error fetching total unread count:', countError);
        // Fallback: try simpler approach
        const { data: conversations } = await supabase
          .from('dm_conversations_with_participants')
          .select('id')
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
          
        if (conversations && conversations.length > 0) {
          const conversationIds = conversations.map(conv => conv.id);
          const { count: fallbackCount } = await supabase
            .from('dm_messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', conversationIds)
            .neq('sender_id', userId)
            .eq('is_read', false);
            
          setTotalUnreadCount(fallbackCount || 0);
        } else {
          setTotalUnreadCount(0);
        }
        return;
      }

      const total = count || 0;
      setTotalUnreadCount(total);
      console.log('UnreadMessages: Total unread count updated:', total);
    } catch (error) {
      console.error('Exception fetching unread count:', error);
      setTotalUnreadCount(0);
    }
  };

  // Subscribe to real-time updates for messages with debouncing
  const subscribeToMessagesUpdates = (userId) => {
    if (!userId) return;

    let updateTimeout = null;
    const debouncedUpdate = () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        fetchUnreadCount(userId);
      }, 500); // Debounce for 500ms to prevent excessive calls
    };

    // Subscribe to message inserts/updates that could affect unread count
    const messagesChannel = supabase
      .channel('unread-messages-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_messages',
        },
        (payload) => {
          console.log('UnreadMessages: Message change detected');
          debouncedUpdate();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_conversations',
        },
        (payload) => {
          console.log('UnreadMessages: Conversation change detected');
          debouncedUpdate();
        }
      )
      .subscribe();

    return () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      messagesChannel.unsubscribe();
    };
  };

  // Manual refresh function for when user opens MessagesScreen
  const refreshUnreadCount = async () => {
    if (currentUserId) {
      await fetchUnreadCount(currentUserId);
    }
  };

  // Function to mark conversation as read (decreases unread count)
  const markConversationAsRead = async (conversationId) => {
    if (!currentUserId) return;

    try {
      // Mark all messages in this conversation as read
      // Note: We mark all messages NOT sent by the current user as read
      const { error } = await supabase
        .from('dm_messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', currentUserId)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking conversation as read:', error);
        return;
      }

      // Refresh the unread count
      await fetchUnreadCount(currentUserId);
    } catch (error) {
      console.error('Exception marking conversation as read:', error);
    }
  };

  const value = {
    totalUnreadCount,
    refreshUnreadCount,
    markConversationAsRead,
    hasUnreadMessages: totalUnreadCount > 0,
  };

  return (
    <UnreadMessagesContext.Provider value={value}>
      {children}
    </UnreadMessagesContext.Provider>
  );
};

export const useUnreadMessages = () => {
  const context = useContext(UnreadMessagesContext);
  if (!context) {
    throw new Error('useUnreadMessages must be used within an UnreadMessagesProvider');
  }
  return context;
};