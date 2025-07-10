import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, ActivityIndicator } from 'react-native';
import Video from 'react-native-video';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://rafyqmwbbagsdugwjaxx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZnlxbXdiYmFnc2R1Z3dqYXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzMzkyODYsImV4cCI6MjA2NjkxNTI4Nn0.IpXi0nO_5tzj_zcap211dRes-dozqX2kmpmGI585X0g';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const { height: windowHeight } = Dimensions.get('window');

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    getSession();

    const { subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      const fetchPosts = async () => {
        const { data, error } = await supabase
          .from('posts')
          .select('id, media_url, content')
          .order('created_at', { ascending: false });

        if (error) {
          console.error(error);
        } else {
          setPosts(data);
        }
      };

      fetchPosts();
    }
  }, [session]);

  const onScrollEnd = (event) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / windowHeight);
    setCurrentIndex(index);
  };

  if (loading || (session && posts.length === 0)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: '#fff' }}>Log in required.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={item => item.id}
      pagingEnabled
      snapToAlignment="start"
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={onScrollEnd}
      getItemLayout={(_, index) => ({
        length: windowHeight,
        offset: windowHeight * index,
        index,
      })}
      renderItem={({ item, index }) => (
        <View style={styles.videoContainer}>
          <Video
            source={{ uri: item.media_url }}
            style={styles.video}
            resizeMode="cover"
            repeat
            paused={index !== currentIndex}
          />
          <View style={styles.overlay}>
            <Text style={styles.caption}>{item.content || 'No caption'}</Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  videoContainer: {
    height: windowHeight,
    width: '100%',
    backgroundColor: '#000',
  },
  video: {
    height: '100%',
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
  },
  caption: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
