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
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../utils/supabase';
import { Ionicons } from '@expo/vector-icons';

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

  const fetchConversations = async (uid) => {
    const { data, error } = await supabase
      .from('dm_conversations')
      .select(`
        id,
        user1_id,
        user2_id,
        last_message,
        updated_at,
        user1: user1_id (username, avatar_url),
        user2: user2_id (username, avatar_url)
      `)
      .or(`user1_id.eq.${uid},user2_id.eq.${uid}`)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error.message);
    } else {
      setConversations(data || []);
    }
  };

  const renderItem = ({ item }) => {
    const otherUser = item.user1_id === userId ? item.user2 : item.user1;
    const previewTime = formatTimeAgo(item.updated_at);

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() =>
          navigation.navigate('ChatScreen', {
            conversationId: item.id,
            recipient: otherUser,
          })
        }
      >
        <Image
          source={
            otherUser.avatar_url
              ? { uri: otherUser.avatar_url }
              : require('../assets/avatar_placeholder.png')
          }
          style={styles.avatar}
        />
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.username}>@{otherUser.username}</Text>
            <Text style={styles.timeText}>{previewTime}</Text>
          </View>
          <Text style={styles.previewText} numberOfLines={1}>
            {item.last_message || 'No messages yet'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
  },
  list: {
    padding: 15,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomColor: '#111',
    borderBottomWidth: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#333',
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  username: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    color: '#666',
    fontSize: 12,
  },
  previewText: {
    color: '#AAA',
    fontSize: 14,
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 30,
  },
});

export default MessagesScreen;