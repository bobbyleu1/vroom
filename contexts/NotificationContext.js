// contexts/NotificationContext.js
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import * as Notifications from 'expo-notifications';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const currentUserId = useRef(null);
  const realtimeSubscription = useRef(null);
  const lastFetch = useRef(null);
  const CACHE_DURATION = 30000; // Cache for 30 seconds

  // Initialize user session and start listening
  useEffect(() => {
    const initializeNotificationListener = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          currentUserId.current = user.id;
          console.log('🔔 NotificationContext: Initializing for user:', user.id);
          
          // Fetch initial notifications
          await fetchNotifications(user.id);
          
          // Start real-time listening
          startRealtimeListener(user.id);
        } else {
          console.log('🔔 NotificationContext: No authenticated user');
          setIsLoading(false);
        }
      } catch (error) {
        console.error('🔔 NotificationContext: Error initializing:', error);
        setIsLoading(false);
      }
    };

    initializeNotificationListener();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        currentUserId.current = session.user.id;
        console.log('🔔 NotificationContext: User signed in, initializing notifications');
        fetchNotifications(session.user.id);
        startRealtimeListener(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        console.log('🔔 NotificationContext: User signed out, cleaning up');
        currentUserId.current = null;
        setNotifications([]);
        setUnreadCount(0);
        cleanupRealtimeListener();
      }
    });

    return () => {
      subscription.unsubscribe();
      cleanupRealtimeListener();
    };
  }, []);

  const fetchNotifications = async (userId, force = false) => {
    try {
      // Check cache first unless forced
      const now = Date.now();
      if (!force && lastFetch.current && (now - lastFetch.current) < CACHE_DURATION) {
        console.log('🔔 NotificationContext: Using cached notifications');
        setIsLoading(false);
        return;
      }

      console.log('🔔 NotificationContext: Fetching notifications for user:', userId);
      
      // Optimize: Get only essential fields first, smaller limit for speed
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, message, is_read, created_at, data')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20); // Reduced from 50 to 20 for faster loading

      if (error) {
        console.error('🔔 NotificationContext: Error fetching notifications:', error);
        return;
      }

      console.log('🔔 NotificationContext: Fetched', data?.length || 0, 'notifications');
      setNotifications(data || []);
      
      // Count unread notifications efficiently
      const unreadCount = data?.reduce((count, n) => count + (n.is_read ? 0 : 1), 0) || 0;
      console.log('🔔 NotificationContext: Unread count:', unreadCount);
      setUnreadCount(unreadCount);
      
      // Update cache timestamp
      lastFetch.current = now;
      
    } catch (error) {
      console.error('🔔 NotificationContext: Exception fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startRealtimeListener = (userId) => {
    // Clean up existing subscription first
    cleanupRealtimeListener();

    console.log('🔔 NotificationContext: Starting real-time listener for user:', userId);
    
    realtimeSubscription.current = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('🔔 NotificationContext: New notification received:', payload.new);
          handleNewNotification(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('🔔 NotificationContext: Notification updated:', payload.new);
          handleUpdatedNotification(payload.new);
        }
      )
      .subscribe((status) => {
        console.log('🔔 NotificationContext: Realtime subscription status:', status);
      });
  };

  const cleanupRealtimeListener = () => {
    if (realtimeSubscription.current) {
      console.log('🔔 NotificationContext: Cleaning up real-time subscription');
      supabase.removeChannel(realtimeSubscription.current);
      realtimeSubscription.current = null;
    }
  };

  const handleNewNotification = (newNotification) => {
    console.log('🔔 NotificationContext: Processing new notification:', newNotification.id);
    
    // Add to notifications list
    setNotifications(prev => [newNotification, ...prev]);
    
    // Update unread count
    if (!newNotification.is_read) {
      setUnreadCount(prev => prev + 1);
      console.log('🔔 NotificationContext: Incremented unread count');
    }

    // Show local notification if app is in foreground
    showLocalNotification(newNotification);
  };

  const handleUpdatedNotification = (updatedNotification) => {
    console.log('🔔 NotificationContext: Processing updated notification:', updatedNotification.id);
    
    setNotifications(prev => 
      prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
    );
    
    // Recalculate unread count
    setNotifications(prev => {
      const unread = prev.filter(n => !n.is_read).length;
      setUnreadCount(unread);
      return prev;
    });
  };

  const showLocalNotification = async (notification) => {
    try {
      // Only show if user has granted permissions and app is in foreground
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: getNotificationTitle(notification.type),
            body: notification.message,
            data: {
              notificationId: notification.id,
              type: notification.type,
            },
          },
          trigger: null, // Show immediately
        });
        console.log('🔔 NotificationContext: Local notification scheduled');
      }
    } catch (error) {
      console.error('🔔 NotificationContext: Error showing local notification:', error);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      console.log('🔔 NotificationContext: Marking notification as read:', notificationId);
      
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) {
        console.error('🔔 NotificationContext: Error marking notification as read:', error);
        return false;
      }

      console.log('🔔 NotificationContext: Successfully marked notification as read');
      return true;
    } catch (error) {
      console.error('🔔 NotificationContext: Exception marking notification as read:', error);
      return false;
    }
  };

  const markAllAsRead = async () => {
    if (!currentUserId.current) return false;

    try {
      console.log('🔔 NotificationContext: Marking all notifications as read');
      
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUserId.current)
        .eq('is_read', false);

      if (error) {
        console.error('🔔 NotificationContext: Error marking all notifications as read:', error);
        return false;
      }

      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      
      console.log('🔔 NotificationContext: Successfully marked all notifications as read');
      return true;
    } catch (error) {
      console.error('🔔 NotificationContext: Exception marking all notifications as read:', error);
      return false;
    }
  };

  const refreshNotifications = async () => {
    if (currentUserId.current) {
      await fetchNotifications(currentUserId.current);
    }
  };

  const getNotificationTitle = (type) => {
    switch (type) {
      case 'post_like':
        return 'New Like! ❤️';
      case 'post_comment':
        return 'New Comment! 💬';
      case 'comment_like':
        return 'Comment Liked! ❤️';
      case 'follow':
        return 'New Follower! 👥';
      case 'direct_message':
        return 'New Message! 📩';
      case 'forum_reply':
        return 'Forum Reply! 💬';
      case 'forum_like':
        return 'Forum Like! ❤️';
      case 'test':
        return 'Test Notification! 🧪';
      default:
        return 'Vroom Social! 🚗';
    }
  };

  const value = {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};