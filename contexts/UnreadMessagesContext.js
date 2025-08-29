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

  // Fetch total unread messages count
  const fetchUnreadCount = async (userId) => {
    if (!userId) return;

    try {
      // Get user's conversations first
      const { data: conversations, error: convError } = await supabase
        .from('dm_conversations_with_participants')
        .select('id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

      if (convError) {
        console.error('Error fetching conversations:', convError);
        return;
      }

      if (!conversations || conversations.length === 0) {
        setTotalUnreadCount(0);
        return;
      }

      // Count all unread messages across all conversations
      const conversationIds = conversations.map(conv => conv.id);
      console.log('UnreadMessages: Counting unread messages for conversations:', conversationIds);
      
      // First try to check if the table exists and is accessible
      const { data: testData, error: testError } = await supabase
        .from('dm_messages')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      
      if (testError) {
        console.error('Cannot access dm_messages table:', testError);
        // Fallback: assume no unread messages for now
        setTotalUnreadCount(0);
        return;
      }
      
      console.log('dm_messages table accessible, proceeding with count query');
      
      // Try a simpler query first to see what columns exist
      const { data: sampleMessage, error: sampleError } = await supabase
        .from('dm_messages')
        .select('*')
        .limit(1)
        .single();
        
      if (sampleError && sampleError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching sample message to check schema:', sampleError);
        setTotalUnreadCount(0);
        return;
      }
      
      if (sampleMessage) {
        console.log('dm_messages table columns:', Object.keys(sampleMessage));
      }

      const { count, error: countError } = await supabase
        .from('dm_messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId)
        .eq('is_read', false);

      if (countError) {
        console.error('Error fetching total unread count:', countError);
        console.error('Query details:', {
          table: 'dm_messages',
          conversationIds,
          userId,
          query: 'count unread messages where conversation_id in [...] AND author_id != userId AND is_read = false'
        });
        // Fallback: assume no unread messages
        setTotalUnreadCount(0);
        return;
      }

      const total = count || 0;
      setTotalUnreadCount(total);
      console.log('UnreadMessages: Total unread count updated:', total);
    } catch (error) {
      console.error('Exception fetching unread count:', error);
    }
  };

  // Subscribe to real-time updates for messages
  const subscribeToMessagesUpdates = (userId) => {
    if (!userId) return;

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
        async (payload) => {
          console.log('UnreadMessages: Message change detected:', payload);
          // Refresh unread count when messages change
          await fetchUnreadCount(userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_conversations',
        },
        async (payload) => {
          console.log('UnreadMessages: Conversation change detected:', payload);
          // Refresh unread count when conversations change
          await fetchUnreadCount(userId);
        }
      )
      .subscribe();

    return () => {
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