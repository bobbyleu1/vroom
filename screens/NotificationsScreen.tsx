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
import { supabase } from '../utils/supabase';
import { Ionicons } from '@expo/vector-icons';

const placeholderAvatar = 'https://i.imgur.com/1bX5QH6.png';

type Notification = {
  id: string;
  message: string;
  type: string;
  created_at: string;
  related_post_id?: string;
  related_user_id?: string;
  sender_id?: string;
  sender_avatar_url?: string;
};

type Props = {
  navigation: any;
};

export default function NotificationsScreen({ navigation }: Props) {
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
  }, []);

  const fetchNotifications = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('notification_view')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching notifications:', error.message);
    } else {
      setNotifications(data as Notification[]);
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
          filter: `user_id=eq.${user.id}`,
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
    switch (item.type) {
      case 'post_like':
      case 'post_comment':
      case 'comment_reply':
        navigation.navigate('PostDetail', { postId: item.related_post_id });
        break;
      case 'follow':
        navigation.navigate('UserProfile', { userId: item.related_user_id });
        break;
      case 'message':
        navigation.navigate('Messages', { userId: item.related_user_id });
        break;
      default:
        break;
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#fff" />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const avatar = item.sender_avatar_url || placeholderAvatar;

          return (
            <TouchableOpacity style={styles.card} onPress={() => handlePress(item)}>
              <Image source={{ uri: avatar }} style={styles.avatar} />
              <View style={styles.textContent}>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.meta}>
                  {item.type.toUpperCase()} • {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              {item.type === 'post_like' && (
                <Ionicons name="heart" size={20} color="#ff3b30" style={styles.heartIcon} />
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No notifications yet 🚘</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    padding: 12,
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
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 16,
  },
});
