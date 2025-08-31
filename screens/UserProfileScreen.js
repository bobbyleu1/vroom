// screens/UserProfileScreen.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  FlatList,
  TouchableOpacity,
  Dimensions, // <<< ENSURE THIS IS IMPORTED
  Alert,
  ScrollView,
  Platform, // <<< AND THIS TOO
} from 'react-native';
import { supabase } from '../utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av'; // For video thumbnails
import { notifyFollow } from '../utils/notificationHelpers';
import { getProfileImageSource } from '../utils/profileHelpers';

// Get the window dimensions for responsive styling
// <<< THIS LINE MUST BE PRESENT RIGHT AFTER IMPORTS
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


function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params; // Get the userId passed from VideoCard
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState(0); // New state for followers count
  const [following, setFollowing] = useState(0); // New state for following count
  const [failedThumbnails, setFailedThumbnails] = useState(new Set());
  const [failedVideos, setFailedVideos] = useState(new Set());
  const currentUserIdRef = useRef(null); // Ref to store current user ID

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      
      // Get current user for follow status
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error("Auth error:", authError.message);
        Alert.alert("Error", "Failed to retrieve current user info.");
      }
      if (user) {
        currentUserIdRef.current = user.id;
      }

      // Use optimized single query to get all profile data
      const { data: profileData, error: profileError } = await supabase
        .rpc('get_user_profile_data', {
          profile_user_id: userId,
          current_user_id: user?.id || null
        });

      if (profileError) {
        console.error("Error fetching profile data:", profileError.message);
        Alert.alert("Error", "Could not load user profile.");
      } else if (profileData && profileData.length > 0) {
        const data = profileData[0];
        
        // Set profile data
        setProfile({
          username: data.username,
          avatar_url: data.avatar_url,
          bio: data.bio
        });
        
        // Set follow counts and status
        setFollowers(parseInt(data.followers_count) || 0);
        setFollowing(parseInt(data.following_count) || 0);
        setIsFollowing(data.is_following || false);
        
        // Set posts data
        const posts = data.posts_data || [];
        setPosts(posts);
        
        console.log(`Fast loaded profile with ${posts.length} posts for user ${userId}`);
      }

      setLoading(false);
    };

    fetchUserData();
  }, [userId]); // Re-run effect if userId changes (navigating to another user's profile)


  // Follow status is now handled in the main profile data query above


  const handleFollowToggle = async () => {
    if (!currentUserIdRef.current) {
      Alert.alert('Login Required', 'Please log in to follow users.');
      return;
    }

    // Optimistic UI update
    setIsFollowing((prev) => !prev);
    setFollowers((prev) => prev + (isFollowing ? -1 : 1));

    try {
      if (isFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', currentUserIdRef.current)
          .eq('following_id', userId);

        if (error) {
          console.error('Error unfollowing:', error.message);
          Alert.alert('Error', 'Failed to unfollow. Please try again.');
          // Revert optimistic update
          setIsFollowing((prev) => !prev);
          setFollowers((prev) => prev - (isFollowing ? -1 : 1));
        }
      } else {
        // Follow
        const { error } = await supabase
          .from('user_follows')
          .insert({ follower_id: currentUserIdRef.current, following_id: userId });

        if (error) {
          console.error('Error following:', error.message);
          Alert.alert('Error', 'Failed to follow. Please try again.');
          // Revert optimistic update
          setIsFollowing((prev) => !prev);
          setFollowers((prev) => prev - (isFollowing ? -1 : 1));
        } else {
          // Send follow notification
          await notifyFollow(currentUserIdRef.current, userId);
        }
      }
    } catch (error) {
      console.error('Exception during follow/unfollow:', error.message);
      Alert.alert('Error', 'An unexpected error occurred.');
      // Revert optimistic update
      setIsFollowing((prev) => !prev);
      setFollowers((prev) => prev - (isFollowing ? -1 : 1));
    }
  };

  const startConversation = async () => {
    if (!currentUserIdRef.current || !userId) {
      Alert.alert('Error', 'Unable to start conversation.');
      return;
    }

    try {
      console.log('Starting conversation between:', currentUserIdRef.current, 'and', userId);
      
      // Use the same RPC function as NewMessageScreen
      const { data, error } = await supabase.rpc('get_or_create_dm_conversation', {
        user1_uuid: currentUserIdRef.current,
        user2_uuid: userId
      });

      console.log('RPC response:', { data, error });

      if (error) {
        console.error('Error creating conversation:', error);
        Alert.alert('Error', 'Could not create conversation.');
        return;
      }

      const conversationId = data;
      console.log('Got conversation ID:', conversationId);

      if (!conversationId) {
        console.error('No conversation ID returned');
        Alert.alert('Error', 'Invalid conversation ID.');
        return;
      }

      // Navigate directly to ChatScreen with the profile user
      navigation.navigate('ChatScreen', {
        conversationId,
        recipient: {
          id: userId,
          username: profile.username,
          avatar_url: profile.avatar_url
        },
      });
    } catch (error) {
      console.error('Exception starting conversation:', error);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  const renderPost = useCallback(({ item, index }) => {
    // Determine the appropriate image source for the thumbnail
    let imageSource;
    let hasValidThumbnail = false;
    
    if (item.file_type === 'image') {
      imageSource = { uri: item.media_url };
      hasValidThumbnail = true;
    } else if (item.file_type === 'video') {
      // For videos, try thumbnail first, then video file, then placeholder
      const hasThumbnail = item.thumbnail_url && item.thumbnail_url.trim() !== '';
      const thumbnailFailed = failedThumbnails.has(item.id);
      const videoFailed = failedVideos.has(item.id);
      
      if (hasThumbnail && !thumbnailFailed) {
        imageSource = { uri: item.thumbnail_url };
        hasValidThumbnail = true;
      } else if (!videoFailed) {
        imageSource = { uri: item.media_url };
        hasValidThumbnail = false;
      } else {
        // Both thumbnail and video failed - use placeholder
        imageSource = require('../assets/video-placeholder.png');
        hasValidThumbnail = true;
      }
    } else {
      // Fallback for any other file types
      imageSource = { uri: item.media_url };
      hasValidThumbnail = true;
    }
    
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('UserPostsFeed', { userId: userId, initialPostIndex: index, postsData: posts })}
        style={styles.postTile}
      >
        <Image 
          source={imageSource} 
          style={styles.postImage}
          resizeMode="cover"
          onError={(error) => {
            console.log(`UserProfileScreen: Error loading thumbnail for post ${item.id}:`, error.nativeEvent.error);
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
          onLoad={() => {
            console.log(`UserProfileScreen: Thumbnail loaded successfully for post ${item.id}`);
          }}
        />
        {/* Show video icon for all videos, with different styling based on thumbnail availability */}
        {item.file_type === 'video' && (
          <View style={[
            styles.videoIconOverlay,
            !hasValidThumbnail && styles.videoIconOverlayCenter
          ]}>
            <Ionicons name="play" size={24} color="rgba(255,255,255,0.8)" />
          </View>
        )}
        {/* Show a loading indicator if we don't have a good thumbnail */}
        {!hasValidThumbnail && item.file_type === 'video' && (
          <View style={styles.thumbnailFallback}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [userId, navigation, posts, failedThumbnails, failedVideos]); // Add dependencies for useCallback

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
        <Text style={styles.errorText}>User profile not found.</Text>
      </View>
    );
  }

  const isOwnProfile = currentUserIdRef.current === userId;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <Image
              source={getProfileImageSource(profile.avatar_url)}
              style={styles.avatar}
              onError={(error) => {
                console.log('UserProfileScreen: Avatar load error:', error.nativeEvent.error);
              }}
              onLoad={() => {
                console.log('UserProfileScreen: Avatar loaded successfully');
              }}
            />
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={16} color="white" />
            </View>
          </View>
          <Text style={styles.username}>@{profile.username}</Text>
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
                console.log('Followers TouchableOpacity pressed!');
                navigation.push('FollowersList', { 
                  userId: userId, 
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
                console.log('Following TouchableOpacity pressed!');
                navigation.push('FollowingList', { 
                  userId: userId, 
                  username: profile?.username 
                });
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.statNumber}>{formatCount(following)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>

          {!isOwnProfile && (
            <View style={styles.buttonColumn}>
              <TouchableOpacity
                style={[styles.followButton, isFollowing ? styles.unfollowButton : styles.followButton]}
                onPress={handleFollowToggle}
              >
                <Text style={styles.followButtonText}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.messageButton}
                onPress={() => {
                  console.log('Message button pressed!');
                  startConversation();
                }}
              >
                <Text style={styles.messageButtonText}>Message</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Tab Container - only Posts tab for other users */}
        <View style={styles.tabContainer}>
          <View style={[styles.tab, styles.activeTab]}>
            <Text style={[styles.tabText, styles.activeTabText]}>Posts</Text>
            <View style={styles.tabUnderline} />
          </View>
        </View>

        {posts.length > 0 ? (
          <FlatList
            data={posts}
            renderItem={renderPost}
            keyExtractor={(item) => item.id}
            numColumns={3}
            scrollEnabled={false}
            contentContainerStyle={styles.grid}
          />
        ) : (
          <Text style={styles.noPostsText}>No posts yet.</Text>
        )}
      </ScrollView>
    </View>
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
  buttonColumn: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
    width: '50%',
  },
  followButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
  },
  unfollowButton: {
    backgroundColor: '#333',
  },
  followButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  messageButton: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
    width: '85%',
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButtonText: {
    color: '#ccc',
    fontWeight: '500',
    fontSize: 12,
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
  videoIconOverlayCenter: {
    top: '50%',
    left: '50%',
    right: 'auto',
    transform: [{ translateX: -16 }, { translateY: -16 }],
  },
  thumbnailFallback: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    transform: [{ translateX: -10 }],
  },
  noPostsText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
});

export default UserProfileScreen;