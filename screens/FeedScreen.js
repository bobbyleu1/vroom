import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, ActivityIndicator, TextInput, TouchableOpacity, StatusBar } from 'react-native';
import { Video } from 'expo-av';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Supabase config
const supabaseUrl = 'https://rafyqmwbbagsdugwjaxx.supabase.co';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
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
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const videoRefs = useRef([]);
  const [currentVisibleIndex, setCurrentVisibleIndex] = useState(0);

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

  const handleViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index;
      setCurrentVisibleIndex(index);

      videoRefs.current.forEach((video, idx) => {
        if (video) {
          if (idx === index) {
            video.playAsync().catch(e => console.log('Play error:', e));
          } else {
            video.pauseAsync().catch(e => console.log('Pause error:', e));
          }
        }
      });
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
  }).current;

  const handleAuth = async () => {
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setAuthLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.authContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.title}>Vroom Login</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={authLoading}>
          <Text style={styles.buttonText}>{authLoading ? 'Loading...' : 'Log In'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  const renderItem = ({ item, index }) => (
    <View style={styles.videoContainer}>
      <Video
        ref={ref => (videoRefs.current[index] = ref)}
        source={{ uri: item.media_url }}
        resizeMode="cover"
        isLooping
        style={styles.video}
        shouldPlay={index === 0}
      />
      <View style={styles.overlay}>
        <Text style={styles.caption}>{item.content || 'No caption'}</Text>
      </View>
    </View>
  );

  return (
    <FlatList
      data={posts}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      pagingEnabled
      snapToAlignment="start"
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      getItemLayout={(_, index) => ({
        length: windowHeight,
        offset: windowHeight * index,
        index,
      })}
    />
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#00BFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  input: {
    width: '100%',
    backgroundColor: '#111',
    color: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#00BFFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
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
});
