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
  const currentUserIdRef = useRef(null); // Ref to store current user ID

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError) {
        console.error("Auth error:", authError.message);
        Alert.alert("Error", "Failed to retrieve current user info.");
      }
      if (user) {
        currentUserIdRef.current = user.id; // Store current user ID
      }

      // Fetch profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, avatar_url, bio') // Select relevant profile fields
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error("Error fetching user profile:", profileError.message);
        Alert.alert("Error", "Could not load user profile.");
      } else {
        setProfile(profileData);
      }

      // Fetch user's posts, including profiles data for VideoCard
      const { data: postsData, error: postsError } = await supabase
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
        .eq('author_id', userId)
        .order('created_at', { ascending: false });

      if (postsError) {
        console.error("Error fetching user posts:", postsError.message);
        console.error("Full error details:", postsError);
        Alert.alert("Error", "Could not load user posts.");
      } else {
        console.log(`Fetched ${postsData?.length || 0} posts for user ${userId}`);
        if (postsData && postsData.length > 0) {
          console.log("Sample post:", postsData[0]);
        }
        setPosts(postsData || []);
      }

      // Fetch follower count for this user (userId)
      const { count: followersCount, error: followersError } = await supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

      if (followersError) {
        console.error("Error fetching followers:", followersError.message);
      } else {
        setFollowers(followersCount || 0);
      }

      // Fetch following count for this user (userId)
      const { count: followingCount, error: followingError } = await supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

      if (followingError) {
        console.error("Error fetching following:", followingError.message);
      } else {
        setFollowing(followingCount || 0);
      }

      setLoading(false);
    };

    fetchUserData();
  }, [userId]); // Re-run effect if userId changes (navigating to another user's profile)


  useEffect(() => {
    // Only check follow status if a currentUserId exists and it's not the user's own profile
    const checkFollowingStatus = async () => {
      if (currentUserIdRef.current && userId && currentUserIdRef.current !== userId) {
        const { data, error } = await supabase
          .from('user_follows')
          .select('id')
          .eq('follower_id', currentUserIdRef.current)
          .eq('following_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error('Error checking follow status:', error.message);
        } else {
          setIsFollowing(!!data);
        }
      }
    };
    if (!loading) { // Only run this check once initial user data is loaded
      checkFollowingStatus();
    }
  }, [currentUserIdRef.current, userId, loading]);


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
    // Determine if this is an image based on file extension
    const isImage = item.media_url?.includes('.jpg') || item.media_url?.includes('.jpeg') || 
                   item.media_url?.includes('.png') || item.media_url?.includes('.JPG') || 
                   item.media_url?.includes('.JPEG') || item.media_url?.includes('.PNG');
    
    // For images, use media_url directly
    // For videos, prefer thumbnail_url, but provide a fallback placeholder if thumbnail is missing
    let thumbnailUri;
    if (isImage) {
      thumbnailUri = item.media_url;
    } else {
      // For videos, only use thumbnail_url if it exists, otherwise use a placeholder
      thumbnailUri = item.thumbnail_url || 'https://via.placeholder.com/300x300/333333/FFFFFF?text=Loading...';
    }
    
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('UserPostsFeed', { userId: userId, initialPostIndex: index })}
        style={styles.postTile}
      >
        <Image 
          source={{ uri: thumbnailUri }} 
          style={styles.postImage}
          onError={(error) => {
            console.log('Thumbnail load error for post', item.id, ':', error.nativeEvent.error);
            console.log('Failed thumbnail URI:', thumbnailUri);
            console.log('item.thumbnail_url:', item.thumbnail_url);
            console.log('item.media_url:', item.media_url);
          }}
          onLoad={() => {
            console.log('Thumbnail loaded successfully for post', item.id);
          }}
        />
        {!isImage && (
          <View style={styles.videoIconOverlay}>
            <Ionicons name="play" size={24} color="rgba(255,255,255,0.8)" />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [userId, navigation]); // Add dependencies for useCallback

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
              source={{ 
                uri: profile.avatar_url ? `${profile.avatar_url}?t=${Date.now()}` : 'https://via.placeholder.com/150',
                cache: 'reload'
              }}
              style={styles.avatar}
              onError={(error) => {
                console.log('Avatar load error:', error.nativeEvent.error);
              }}
              onLoad={() => {
                console.log('Avatar loaded successfully');
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
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{formatCount(followers)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{formatCount(following)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
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
  noPostsText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
});

export default UserProfileScreen;