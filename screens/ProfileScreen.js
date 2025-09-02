// screens/ProfileScreen.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  FlatList,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { supabase } from '../utils/supabase';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Video } from 'expo-av';
import { getProfileImageSource } from '../utils/profileHelpers';
import PhoneViewport from '../components/PhoneViewport';
import { isPad } from '../utils/phoneViewport';

const { width } = Dimensions.get('window');

/**
 * Formats a numeric count into a more human-readable string (e.g., 1234 -> "1.2K").
 * Values under 1k are returned as-is.
 * This is duplicated from VideoCard for now, consider making a shared utility.
 */
const formatCount = (num) => {
  if (num === null || num === undefined) return '0';
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toString();
};


export default function ProfileScreen() {
  const navigation = useNavigation();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [activeTab, setActiveTab] = useState('posts');
  const [failedThumbnails, setFailedThumbnails] = useState(new Set());
  const [failedVideos, setFailedVideos] = useState(new Set());
  const currentUserIdRef = useRef(null);

  useEffect(() => {
    const fetchProfileAndPosts = async (retryCount = 0) => {
      setLoading(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Error getting session:", sessionError.message);
        if (retryCount < 2) {
          setTimeout(() => fetchProfileAndPosts(retryCount + 1), 1000);
          return;
        }
        Alert.alert("Error", "Failed to get user session.");
        setLoading(false);
        return;
      }

      if (!session) {
        setProfile(null);
        setPosts([]);
        setFollowers(0);
        setFollowing(0);
        setLoading(false);
        return;
      }

      const userId = session.user.id;
      currentUserIdRef.current = userId;

      try {
        // Batch all requests in parallel for better performance
        const [profileResult, postsResult, savedPostsResult, followersResult, followingResult] = await Promise.allSettled([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('posts').select(`
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
          `).eq('author_id', userId).order('created_at', { ascending: false }),
          supabase.from('saved_posts').select(`
            posts (
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
            )
          `).eq('user_id', userId).order('created_at', { ascending: false }),
          supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
        ]);

        // Handle profile data
        if (profileResult.status === 'fulfilled' && !profileResult.value.error) {
          setProfile(profileResult.value.data);
        } else {
          console.error("Error fetching user profile:", profileResult.value?.error?.message);
          if (retryCount < 2) {
            setTimeout(() => fetchProfileAndPosts(retryCount + 1), 1000);
            return;
          }
        }

        // Handle posts data
        if (postsResult.status === 'fulfilled' && !postsResult.value.error) {
          setPosts(postsResult.value.data || []);
        } else {
          console.error("Error fetching user posts:", postsResult.value?.error?.message);
          setPosts([]);
        }

        // Handle saved posts data
        if (savedPostsResult.status === 'fulfilled' && !savedPostsResult.value.error) {
          setSavedPosts(savedPostsResult.value.data?.map(item => item.posts) || []);
        } else {
          console.error("Error fetching saved posts:", savedPostsResult.value?.error?.message);
          setSavedPosts([]);
        }

        // Handle followers count
        if (followersResult.status === 'fulfilled' && !followersResult.value.error) {
          setFollowers(followersResult.value.count || 0);
        } else {
          console.error("Error fetching followers:", followersResult.value?.error?.message);
          setFollowers(0);
        }

        // Handle following count
        if (followingResult.status === 'fulfilled' && !followingResult.value.error) {
          setFollowing(followingResult.value.count || 0);
        } else {
          console.error("Error fetching following:", followingResult.value?.error?.message);
          setFollowing(0);
        }

      } catch (error) {
        console.error("Caught error during profile fetch:", error.message);
        if (retryCount < 2) {
          setTimeout(() => fetchProfileAndPosts(retryCount + 1), 1000);
          return;
        }
        Alert.alert("Error", "An unexpected error occurred while loading profile.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfileAndPosts();
  }, []);

  // Add a focused effect for refreshing posts only when needed
  useFocusEffect(
    useCallback(() => {
      const refreshPosts = async () => {
        if (!currentUserIdRef.current) return;
        
        const { data: userPosts } = await supabase
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
          .eq('author_id', currentUserIdRef.current)
          .order('created_at', { ascending: false });

        if (userPosts) {
          setPosts(userPosts);
        }

        // Also refresh saved posts
        const { data: savedPostsData } = await supabase
          .from('saved_posts')
          .select(`
            posts (
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
            )
          `)
          .eq('user_id', currentUserIdRef.current)
          .order('created_at', { ascending: false });

        if (savedPostsData) {
          setSavedPosts(savedPostsData.map(item => item.posts));
        }
      };

      refreshPosts();
    }, [])
  );

  const renderPost = ({ item, index }) => {
    const data = activeTab === 'posts' ? posts : savedPosts;
    
    // Determine the appropriate image source for the thumbnail
    let imageSource;
    if (item.file_type === 'image') {
      imageSource = { uri: item.media_url };
    } else if (item.file_type === 'video') {
      // For videos, try thumbnail first, then video file, then placeholder
      const hasThumbnail = item.thumbnail_url && item.thumbnail_url.trim() !== '';
      const thumbnailFailed = failedThumbnails.has(item.id);
      const videoFailed = failedVideos.has(item.id);
      
      if (hasThumbnail && !thumbnailFailed) {
        imageSource = { uri: item.thumbnail_url };
      } else if (!videoFailed) {
        imageSource = { uri: item.media_url };
      } else {
        // Both thumbnail and video failed - use placeholder
        imageSource = require('../assets/video-placeholder.png');
      }
    } else {
      // Fallback for any other file types
      imageSource = { uri: item.media_url };
    }
    
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('UserPostsFeed', { 
          userId: currentUserIdRef.current, 
          initialPostIndex: index,
          postsData: data,
          sourceTab: activeTab
        })}
        style={responsiveStyles.postTile}
      >
        <Image 
          source={imageSource} 
          style={styles.postImage}
          onError={(error) => {
            console.log(`ProfileScreen: Error loading thumbnail for post ${item.id}:`, error.nativeEvent.error);
            // Handle different fallback scenarios for videos
            if (item.file_type === 'video') {
              if (imageSource.uri === item.thumbnail_url) {
                // Thumbnail failed - try video file
                setFailedThumbnails(prev => new Set([...prev, item.id]));
              } else if (imageSource.uri === item.media_url) {
                // Video file failed - use placeholder
                setFailedVideos(prev => new Set([...prev, item.id]));
              }
            }
          }}
        />
        {item.file_type === 'video' && (
          <View style={styles.videoIconOverlay}>
            <Ionicons name="play" size={24} color="rgba(255,255,255,0.8)" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderTabContent = () => {
    const data = activeTab === 'posts' ? posts : savedPosts;
    const emptyMessage = activeTab === 'posts' 
      ? "You haven't posted anything yet." 
      : "You haven't saved any posts yet.";

    if (data.length > 0) {
      return (
        <FlatList
          data={data}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          numColumns={3}
          scrollEnabled={false}
          contentContainerStyle={styles.grid}
        />
      );
    } else {
      return <Text style={styles.noPostsText}>{emptyMessage}</Text>;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Profile not found. Please log in.</Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.loginButtonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Dynamic styles for proper grid sizing on iPad
  const containerWidth = width;
  const responsiveStyles = StyleSheet.create({
    postTile: {
      width: containerWidth / 3,
      aspectRatio: 9/16, // Proper video aspect ratio instead of 1:1
      borderWidth: 1,
      borderColor: '#2a2a2d',
    },
  });

  const renderContent = () => (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
      <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <Image 
              source={getProfileImageSource(profile.avatar_url)} 
              style={styles.avatar}
              onError={(error) => {
                console.log('ProfileScreen: Avatar load error:', error.nativeEvent.error);
              }}
              onLoad={() => {
                console.log('ProfileScreen: Avatar loaded successfully');
              }}
            />
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={16} color="white" />
            </View>
          </View>
          <Text style={styles.username}>@{profile.username || 'NewUser'}</Text>
          {profile.bio ? (
            <Text style={styles.profileBio}>{profile.bio}</Text>
          ) : (
            <Text style={styles.profileBio}>Automotive enthusiast</Text>
          )}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{formatCount(posts.length)}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <TouchableOpacity 
              style={styles.statBox}
              onPress={() => {
                console.log('ProfileScreen: Followers TouchableOpacity pressed!');
                navigation.navigate('FollowersList', { 
                  userId: currentUserIdRef.current, 
                  username: profile?.username 
                });
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.statNumber}>{formatCount(followers)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.statBox}
              onPress={() => {
                console.log('ProfileScreen: Following TouchableOpacity pressed!');
                navigation.navigate('FollowingList', { 
                  userId: currentUserIdRef.current, 
                  username: profile?.username 
                });
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.statNumber}>{formatCount(following)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
            onPress={() => setActiveTab('posts')}
          >
            <Text style={[styles.tabText, activeTab === 'posts' && styles.activeTabText]}>Posts</Text>
            {activeTab === 'posts' && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'saved' && styles.activeTab]}
            onPress={() => setActiveTab('saved')}
          >
            <Text style={[styles.tabText, activeTab === 'saved' && styles.activeTabText]}>Favorites</Text>
            {activeTab === 'saved' && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        </View>

        {renderTabContent()}
        </ScrollView>
    </View>
  );

  return (
    <PhoneViewport>
      {renderContent()}
    </PhoneViewport>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1d',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1d',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1d',
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#333',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00BFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#1a1a1d',
  },
  username: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  profileBio: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 25,
    width: '80%',
    justifyContent: 'space-between',
  },
  statBox: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  statNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  editBtn: {
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 8,
    minWidth: 150,
  },
  editBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginHorizontal: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    position: 'relative',
  },
  activeTab: {
    // Active tab styling handled by activeTabText and tabUnderline
  },
  tabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '600',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: '25%',
    right: '25%',
    height: 3,
    backgroundColor: '#ff6b35',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 1,
  },
  postTile: {
    width: width / 3,
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#2a2a2d',
  },
  postImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  videoIconOverlay: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },
  noPostsText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
});