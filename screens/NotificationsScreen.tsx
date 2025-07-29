import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../utils/supabase';

export default function NotificationsScreen({ navigation }) {
  const [user, setUser] = useState(null);

useEffect(() => {
  const fetchUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUser(user);
  };
  fetchUser();
}, []);

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching notifications:', error);
    else setNotifications(data);

    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handlePress = (item) => {
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
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handlePress(item)}>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.meta}>
              {item.type.toUpperCase()} • {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No notifications yet 🚘</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 16 },
  card: { backgroundColor: '#111', padding: 16, borderRadius: 8, marginBottom: 12 },
  message: { color: '#fff', fontSize: 15 },
  meta: { color: '#888', fontSize: 12, marginTop: 6 },
  empty: { color: '#777', textAlign: 'center', marginTop: 80 },
});
