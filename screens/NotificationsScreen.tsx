import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { getProfileImageSource } from '../utils/profileHelpers';
import { useNotifications } from '../contexts/NotificationContext';

type Notification = {
  id: string;
  recipient_id: string;
  type: string;
  title?: string;
  body?: string;
  data?: any;
  is_read: boolean;
  created_at: string;
  sender_info?: {
    id: string;
    username: string;
    avatar_url?: string;
  };
};

type Props = {
  navigation: any;
};

export default function NotificationsScreen({ navigation }: Props) {
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const { markAllAsRead } = useNotifications();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
  }, []);

  const fetchNotifications = async () => {
    if (!user?.id) return;

    try {
      // Start with a simple query to see what's available
      console.log('Fetching notifications for user:', user.id);
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        // If recipient_id doesn't work, try other common field names
        if (error.message.includes('recipient_id')) {
          const alternateQuery = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);
            
          if (alternateQuery.error) {
            console.error('❌ Error fetching notifications:', alternateQuery.error);
            setNotifications([]);
          } else {
            console.log('✅ Notifications fetched via alternate query:', alternateQuery.data);
            // Fetch sender profile information for each notification
            const notificationsWithProfiles = await Promise.all(
              (alternateQuery.data || []).map(async (notification) => {
                // Use sender_id first, then fall back to related_user_id for backwards compatibility
                const userId = notification.sender_id || notification.related_user_id;
                if (userId) {
                  try {
                    const { data: senderProfile, error: profileError } = await supabase
                      .from('profiles')
                      .select('id, username, avatar_url')
                      .eq('id', userId)
                      .single();
                    
                    if (!profileError && senderProfile) {
                      return {
                        ...notification,
                        sender: senderProfile
                      };
                    }
                  } catch (err) {
                    console.log('Error fetching sender profile for userId', userId, ':', err);
                  }
                }
                return notification;
              })
            );
            
            setNotifications(notificationsWithProfiles);
          }
        } else {
          console.error('❌ Error fetching notifications:', error.message);
          setNotifications([]);
        }
      } else {
        console.log('✅ Notifications fetched successfully:', data);
        // Fetch sender profile information for each notification
        const notificationsWithProfiles = await Promise.all(
          (data || []).map(async (notification) => {
            // Use sender_id first, then fall back to related_user_id for backwards compatibility
            const userId = notification.sender_id || notification.related_user_id;
            if (userId) {
              try {
                const { data: senderProfile, error: profileError } = await supabase
                  .from('profiles')
                  .select('id, username, avatar_url')
                  .eq('id', userId)
                  .single();
                
                if (!profileError && senderProfile) {
                  return {
                    ...notification,
                    sender: senderProfile
                  };
                }
              } catch (err) {
                console.log('Error fetching sender profile for userId', userId, ':', err);
              }
            }
            return notification;
          })
        );
        
        setNotifications(notificationsWithProfiles);
      }
    } catch (e) {
      console.error('Exception in fetchNotifications:', e);
      setNotifications([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!user?.id) return;

    fetchNotifications();
    
    // Mark all notifications as read when user views this screen
    const markAsReadTimer = setTimeout(() => {
      console.log('🔔 NotificationsScreen: Auto-marking all notifications as read');
      markAllAsRead();
    }, 1000); // Small delay to ensure screen is visible

    const channel = supabase
      .channel('notification_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new;
          if (!newNotif) return;

          // manually fetch updated sender_avatar_url for this new notif
          fetchNotifications(); // or just re-fetch all for now
        }
      )
      .subscribe();

    return () => {
      clearTimeout(markAsReadTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id, markAllAsRead]);

  const handlePress = async (item: Notification) => {
    const data = item.data || {};
    console.log('Notification pressed:', item.type, 'data:', data, 'full item:', JSON.stringify(item, null, 2));
    
    try {
      switch (item.type.toLowerCase()) {
        case 'post_like':
        case 'POST_LIKE':
          // Try multiple possible field names for backward compatibility
          const likePostId = data.post_id || data.related_post_id || data.postId || data.relatedPostId;
          await handlePostNotification(likePostId, false);
          break;
          
        case 'post_comment':
        case 'POST_COMMENT':
        case 'comment_reply':
        case 'COMMENT_REPLY':
          // Try multiple possible field names for backward compatibility
          const commentPostId = data.post_id || data.related_post_id || data.postId || data.relatedPostId;
          await handlePostNotification(commentPostId, true);
          break;
          
        case 'follow':
        case 'FOLLOW':
          // Try multiple possible field names for backward compatibility
          const followerId = data.sender_id || data.followerId || data.follower_id || item.sender_id || item.related_user_id || item.sender_info?.id;
          await handleFollowNotification(followerId);
          break;
          
        case 'direct_message':
        case 'DIRECT_MESSAGE':
          // Try multiple possible field names for backward compatibility
          const conversationId = data.conversation_id || data.conversationId;
          const senderId = data.sender_id || data.senderId || item.sender_id || item.related_user_id || item.sender_info?.id;
          await handleDirectMessageNotification(conversationId, senderId);
          break;
          
        default:
          console.log('Unhandled notification type:', item.type, 'Available data keys:', Object.keys(data));
          break;
      }
    } catch (error) {
      console.error('Error handling notification press:', error);
    }
  };

  const handlePostNotification = async (postId: string, openComments: boolean = false) => {
    if (!postId) {
      console.error('No post ID provided for post notification - this is likely an old notification without proper data structure. Navigating to main feed instead.');
      // Fallback for old notifications without post ID
      navigation.navigate('MainApp', { screen: 'Feed' });
      return;
    }

    try {
      console.log(`Navigating to post ${postId}, openComments: ${openComments}`);
      
      // First get the post details to determine the author and find it in their feed
      const { data: post, error } = await supabase
        .from('posts')
        .select(`
          id,
          author_id,
          created_at,
          media_url,
          thumbnail_url,
          content,
          file_type,
          like_count,
          comment_count,
          view_count,
          profiles!posts_author_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('id', postId)
        .single();

      if (error || !post) {
        console.error('Error fetching post:', error);
        return;
      }

      // Get all posts from this author to create the feed context
      const { data: authorPosts, error: postsError } = await supabase
        .from('posts')
        .select(`
          id,
          created_at,
          media_url,
          thumbnail_url,
          content,
          file_type,
          like_count,
          comment_count,
          view_count,
          author_id,
          profiles!posts_author_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('author_id', post.author_id)
        .order('created_at', { ascending: false });

      if (postsError || !authorPosts) {
        console.error('Error fetching author posts:', postsError);
        return;
      }

      // Find the index of the specific post in the author's feed
      const postIndex = authorPosts.findIndex(p => p.id === postId);
      const finalIndex = postIndex >= 0 ? postIndex : 0;

      console.log(`Found post at index ${finalIndex} in author's feed of ${authorPosts.length} posts`);

      // Navigate to UserPostsFeed with the specific post and index
      navigation.navigate('UserPostsFeed', { 
        userId: post.author_id,
        initialPostIndex: finalIndex,
        postsData: authorPosts,
        sourceTab: 'posts',
        openComments: openComments // Pass this to potentially open comments automatically
      });

    } catch (error) {
      console.error('Error in handlePostNotification:', error);
    }
  };

  const handleFollowNotification = async (senderId: string) => {
    if (!senderId) {
      console.error('No sender ID provided for follow notification - this is likely an old notification without proper data structure. Cannot navigate to profile.');
      return;
    }

    console.log('Navigating to user profile:', senderId);
    navigation.navigate('UserProfile', { userId: senderId });
  };

  const handleDirectMessageNotification = async (conversationId: string, senderId: string) => {
    console.log('handleDirectMessageNotification called with:', { conversationId, senderId });
    
    if (!conversationId && !senderId) {
      console.error('No conversation ID or sender ID provided for message notification - this is likely an old notification without proper data structure. Navigating to messages screen.');
      // Fallback for old notifications without proper data
      navigation.navigate('MessagesScreen');
      return;
    }

    try {
      console.log('Navigating to chat, conversationId:', conversationId, 'senderId:', senderId);
      
      if (conversationId) {
        // Get the conversation details to find the recipient info
        const { data: conversation, error } = await supabase
          .from('dm_conversations')
          .select(`
            id,
            user1_id,
            user2_id,
            profiles!dm_conversations_user1_id_fkey (
              id,
              username,
              avatar_url
            ),
            user2:profiles!dm_conversations_user2_id_fkey (
              id,
              username,
              avatar_url
            )
          `)
          .eq('id', conversationId)
          .single();

        if (error || !conversation) {
          console.error('Error fetching conversation:', error);
          navigation.navigate('MessagesScreen');
          return;
        }

        // Determine which user is the sender (not current user)
        const currentUser = user?.id;
        const recipient = conversation.user1_id === currentUser 
          ? conversation.user2 
          : conversation.profiles;

        if (recipient) {
          navigation.navigate('ChatScreen', {
            conversationId: conversationId,
            recipient: {
              id: recipient.id,
              username: recipient.username,
              avatar_url: recipient.avatar_url
            }
          });
        } else {
          navigation.navigate('MessagesScreen');
        }
      } else if (senderId) {
        // Create or find conversation with this sender
        const { data: senderProfile, error: senderError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', senderId)
          .single();

        if (senderError || !senderProfile) {
          console.error('Error fetching sender profile:', senderError);
          navigation.navigate('MessagesScreen');
          return;
        }

        // Try to get or create conversation
        const { data: conversationId, error: convError } = await supabase
          .rpc('get_or_create_dm_conversation', {
            user1_uuid: user?.id,
            user2_uuid: senderId
          });

        if (convError || !conversationId) {
          console.error('Error getting conversation:', convError);
          navigation.navigate('MessagesScreen');
          return;
        }

        navigation.navigate('ChatScreen', {
          conversationId: conversationId,
          recipient: {
            id: senderProfile.id,
            username: senderProfile.username,
            avatar_url: senderProfile.avatar_url
          }
        });
      }
    } catch (error) {
      console.error('Error in handleDirectMessageNotification:', error);
      navigation.navigate('MessagesScreen');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00BFFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          // Handle different possible data structures
          const displayTitle = item.title || item.body || item.message || 'New notification';
          const notificationType = item.type || 'notification';

          return (
            <TouchableOpacity style={styles.card} onPress={() => handlePress(item)}>
              <Image 
                source={getProfileImageSource(
                  item.sender?.avatar_url || 
                  item.sender_info?.avatar_url || 
                  item.sender_avatar_url
                )} 
                style={styles.avatar}
                onError={(error) => {
                  console.log('NotificationsScreen: Avatar load error:', error.nativeEvent.error);
                }}
                onLoad={() => {
                  console.log('NotificationsScreen: Avatar loaded successfully for:', item.sender?.username || 'unknown user');
                }}
              />
              <View style={styles.textContent}>
                <Text style={styles.message}>{displayTitle}</Text>
                <Text style={styles.meta}>
                  {notificationType.toUpperCase()} • {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              {(notificationType === 'POST_LIKE' || notificationType === 'post_like') && (
                <Ionicons name="heart" size={20} color="#ff3b30" style={styles.heartIcon} />
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.empty}>No notifications yet 🚘</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#000000',
  },
  backButton: {
    padding: 4,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
    marginRight: -32, // Offset to center text properly with back button
  },
  headerSpacer: {
    width: 32, // Same width as back button to balance layout
  },
  listContainer: {
    padding: 12,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    backgroundColor: '#333',
  },
  textContent: {
    flex: 1,
  },
  message: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  meta: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  heartIcon: {
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    fontSize: 16,
  },
});
