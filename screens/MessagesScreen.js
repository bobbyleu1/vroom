// screens/MessagesScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useUnreadMessages } from '../contexts/UnreadMessagesContext';
import { getProfileImageSource } from '../utils/profileHelpers';
import { getIPadStyles, isTablet } from '../utils/iPadStyles';

// Helper to format updated_at timestamps into relative time strings
const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365.25);
  return `${years}y ago`;
};

const MessagesScreen = () => {
  const navigation = useNavigation();
  const [conversations, setConversations] = useState([]);
  const [userId, setUserId] = useState(null);
  const { refreshUnreadCount } = useUnreadMessages();

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        fetchConversations(user.id);
      }
    };
    fetchUser();
  }, []);

  // Refresh unread counts when this screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      refreshUnreadCount();
    }, [refreshUnreadCount])
  );

  const fetchConversations = async (uid) => {
    try {
      // Get conversations - only select columns that exist
      const { data, error } = await supabase
        .from('dm_conversations_with_participants')
        .select(`
          id,
          user1_id,
          user2_id,
          user1_username,
          user2_username,
          last_message,
          updated_at
        `)
        .or(`user1_id.eq.${uid},user2_id.eq.${uid}`)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching conversations:', error.message);
        return;
      }

      // Transform data to include other user info and manually calculate unread counts
      const transformedData = await Promise.all(data.map(async (conversation) => {
        const isUser1 = conversation.user1_id === uid;
        const otherUserId = isUser1 ? conversation.user2_id : conversation.user1_id;
        const otherUsername = isUser1 ? conversation.user2_username : conversation.user1_username;

        // Fetch avatar for the other user
        let otherUserAvatar = null;
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('id', otherUserId)
            .single();
          
          otherUserAvatar = profileData?.avatar_url || null;
        } catch (avatarError) {
          console.warn('Could not fetch avatar for user:', otherUserId, avatarError.message);
        }

        const otherUser = {
          id: otherUserId,
          username: otherUsername,
          avatar_url: otherUserAvatar
        };

        // Calculate unread count for this conversation
        let unread_count = 0;
        try {
          const { count, error: unreadError } = await supabase
            .from('dm_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conversation.id)
            .neq('sender_id', uid)
            .eq('is_read', false);
          
          if (unreadError) {
            console.warn('Unread count query error for conversation:', conversation.id, unreadError);
            unread_count = 0; // Fallback to 0
          } else {
            unread_count = count || 0;
          }
        } catch (unreadError) {
          console.warn('Could not fetch unread count for conversation:', conversation.id, unreadError.message);
          unread_count = 0; // Fallback to 0
        }

        return {
          ...conversation,
          otherUser,
          unread_count
        };
      }));

      setConversations(transformedData);
    } catch (error) {
      console.error('Error in fetchConversations:', error.message);
    }
  };

  const renderItem = ({ item }) => {
    const { otherUser } = item;
    const previewTime = formatTimeAgo(item.updated_at);
    const hasUnread = item.unread_count > 0;

    return (
      <TouchableOpacity
        style={[styles.chatItem, hasUnread && styles.unreadChatItem]}
        onPress={() =>
          navigation.navigate('ChatScreen', {
            conversationId: item.id,
            recipient: otherUser,
          })
        }
      >
        <View style={styles.avatarContainer}>
          <Image
            source={getProfileImageSource(otherUser.avatar_url)}
            style={styles.avatar}
          />
          {hasUnread && <View style={styles.unreadBadge} />}
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={[styles.username, hasUnread && styles.unreadUsername]}>@{otherUser.username}</Text>
            <View style={styles.timeContainer}>
              <Text style={styles.timeText}>{previewTime}</Text>
              {hasUnread && (
                <View style={styles.unreadCountBadge}>
                  <Text style={styles.unreadCountText}>{item.unread_count}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={[styles.previewText, hasUnread && styles.unreadPreviewText]} numberOfLines={1}>
            {item.last_message || 'Start a conversation...'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const iPadStyles = getIPadStyles('#1a1a1d');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={iPadStyles.container}>
        <View style={iPadStyles.phoneContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#00BFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={() => navigation.navigate('NewMessageScreen')}>
          <Ionicons name="create-outline" size={28} color="#00BFFF" />
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No conversations yet. Tap + to start one.</Text>
        }
      />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomColor: '#222',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    flex: 1,
    textAlign: 'center',
  },
  list: {
    padding: 15,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomColor: '#111',
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  unreadChatItem: {
    backgroundColor: '#0A0A0A',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
  },
  unreadBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00BFFF',
    borderWidth: 2,
    borderColor: '#000',
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  unreadUsername: {
    fontWeight: '700',
  },
  timeText: {
    color: '#666',
    fontSize: 12,
  },
  unreadCountBadge: {
    backgroundColor: '#00BFFF',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadCountText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  previewText: {
    color: '#AAA',
    fontSize: 14,
    marginTop: 4,
  },
  unreadPreviewText: {
    color: '#CCC',
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 30,
  },
});

export default MessagesScreen;