// screens/SearchScreen.js
import React, { useState, useEffect } from 'react';
import { View, TextInput, FlatList, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';

const placeholderAvatar = 'https://i.imgur.com/1bX5QH6.png';

const SearchScreen = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [videoResults, setVideoResults] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'users', 'videos'
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  // Auto-search when query changes with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim().length > 0) {
        performSearch();
      } else {
        setUserResults([]);
        setVideoResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [query]);

  const performSearch = async () => {
    console.log('[SEARCH] Starting search with query:', query);
    
    if (!query.trim()) {
      console.log('[SEARCH] Empty query, clearing results');
      setUserResults([]);
      setVideoResults([]);
      return;
    }

    setLoading(true);
    
    try {
      console.log('[SEARCH] Searching users...');
      // Search users by username
      const { data: users, error: userError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${query}%`)
        .limit(20);

      console.log('[SEARCH] User search result:', { users, userError });

      if (!userError) {
        setUserResults(users || []);
        console.log('[SEARCH] Set user results:', users?.length || 0);
      } else {
        console.error('[SEARCH] User search error:', userError);
        setUserResults([]);
      }

      console.log('[SEARCH] Searching posts...');
      // Search all posts by content (not just videos) to get more results
      const { data: videos, error: videoError } = await supabase
        .from('posts')
        .select(`
          id, content, thumbnail_url, created_at, like_count, comment_count, file_type, author_id,
          profiles!posts_author_id_fkey (id, username, avatar_url)
        `)
        .or(`content.ilike.%${query}%,content.ilike.%#${query}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      console.log('[SEARCH] Post search result:', { videos, videoError });

      if (!videoError) {
        setVideoResults(videos || []);
        console.log('[SEARCH] Set video results:', videos?.length || 0);
      } else {
        console.error('[SEARCH] Post search error:', videoError);
        setVideoResults([]);
      }
    } catch (error) {
      console.error('[SEARCH] Exception during search:', error);
    } finally {
      setLoading(false);
      console.log('[SEARCH] Search completed');
    }
  };

  const handleUserPress = (user) => {
    navigation.navigate('UserProfile', { userId: user.id });
  };

  const handleVideoPress = (video) => {
    // Navigate to video detail or user posts feed
    navigation.navigate('UserPostsFeed', { 
      userId: video.profiles?.id || video.author_id,
      initialPostId: video.id 
    });
  };

  const getDisplayResults = () => {
    let results = [];
    
    if (activeTab === 'all' || activeTab === 'users') {
      results = results.concat(
        userResults.map(user => ({ ...user, type: 'user' }))
      );
    }
    
    if (activeTab === 'all' || activeTab === 'videos') {
      results = results.concat(
        videoResults.map(video => ({ ...video, type: 'video' }))
      );
    }
    
    return results;
  };

  const renderUserItem = (user) => (
    <TouchableOpacity style={styles.userItem} onPress={() => handleUserPress(user)}>
      <Image 
        source={{ uri: user.avatar_url || placeholderAvatar }} 
        style={styles.userAvatar}
      />
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{user.username}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#666" />
    </TouchableOpacity>
  );

  const renderVideoItem = (video) => (
    <TouchableOpacity style={styles.videoItem} onPress={() => handleVideoPress(video)}>
      <Image 
        source={{ uri: video.thumbnail_url || placeholderAvatar }} 
        style={styles.videoThumbnail}
      />
      <View style={styles.videoInfo}>
        <Text style={styles.videoCaption} numberOfLines={2}>
          {video.content || 'No caption'}
        </Text>
        <View style={styles.videoMeta}>
          <Text style={styles.videoAuthor}>@{video.profiles?.username || 'Unknown'}</Text>
          <View style={styles.videoStats}>
            <Ionicons name="heart" size={14} color="#ff3b30" />
            <Text style={styles.statText}>{video.like_count || 0}</Text>
            <Ionicons name="chatbubble" size={14} color="#888" style={{ marginLeft: 12 }} />
            <Text style={styles.statText}>{video.comment_count || 0}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

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
        <Text style={styles.headerTitle}>Search</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.content}>
        <TextInput
          placeholder='Search users, videos, hashtags...'
          placeholderTextColor='#888'
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={performSearch}
          returnKeyType="search"
        />

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'all' && styles.activeTab]}
            onPress={() => setActiveTab('all')}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'users' && styles.activeTab]}
            onPress={() => setActiveTab('users')}
          >
            <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>
              Users ({userResults.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'videos' && styles.activeTab]}
            onPress={() => setActiveTab('videos')}
          >
            <Text style={[styles.tabText, activeTab === 'videos' && styles.activeTabText]}>
              Videos ({videoResults.length})
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00BFFF" />
          </View>
        ) : (
          <FlatList
            data={getDisplayResults()}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              if (item.type === 'user') {
                return renderUserItem(item);
              } else {
                return renderVideoItem(item);
              }
            }}
            ListEmptyComponent={
              query.trim() ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No results found for "{query}"</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search" size={64} color="#333" />
                  <Text style={styles.emptyText}>Search for users and videos</Text>
                </View>
              )
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

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
  content: {
    flex: 1,
    padding: 16,
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 16,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#00BFFF',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#333',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  fullName: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  videoItem: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  videoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#333',
  },
  videoInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  videoCaption: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  videoMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoAuthor: {
    color: '#00BFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  videoStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#888',
    fontSize: 12,
    marginLeft: 4,
  },
});

export default SearchScreen;

