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

const placeholderAvatar = 'https://i.imgur.com/1bX5QH6.png';

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
            setNotifications(alternateQuery.data || []);
          }
        } else {
          console.error('❌ Error fetching notifications:', error.message);
          setNotifications([]);
        }
      } else {
        console.log('✅ Notifications fetched successfully:', data);
        setNotifications(data || []);
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
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handlePress = (item: Notification) => {
    const data = item.data || {};
    
    switch (item.type) {
      case 'POST_LIKE':
      case 'POST_COMMENT':
      case 'COMMENT_REPLY':
        if (data.post_id) {
          navigation.navigate('PostDetail', { postId: data.post_id });
        }
        break;
      case 'FOLLOW':
        if (item.sender_info?.id) {
          navigation.navigate('UserProfile', { userId: item.sender_info.id });
        }
        break;
      case 'DIRECT_MESSAGE':
        if (item.sender_info?.id) {
          navigation.navigate('Messages', { userId: item.sender_info.id });
        }
        break;
      default:
        console.log('Unhandled notification type:', item.type);
        break;
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
          const avatar = item.sender_info?.avatar_url || item.sender_avatar_url || placeholderAvatar;
          const displayTitle = item.title || item.body || item.message || 'New notification';
          const notificationType = item.type || 'notification';

          return (
            <TouchableOpacity style={styles.card} onPress={() => handlePress(item)}>
              <Image source={{ uri: avatar }} style={styles.avatar} />
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
