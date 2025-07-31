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
          content,
          file_type,
          like_count,
          comment_count,
          view_count,
          author_id,
          profiles (
            username,
            avatar_url
          )
        `)
        .eq('author_id', userId)
        .order('created_at', { ascending: false });

      if (postsError) {
        console.error("Error fetching user posts:", postsError.message);
        Alert.alert("Error", "Could not load user posts.");
      } else {
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

  const renderPost = useCallback(({ item, index }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('UserPostsFeed', { userId: userId, initialPostIndex: index })}
      style={styles.postTile}
    >
      {item.file_type === 'image' ? (
        <Image source={{ uri: item.media_url }} style={styles.postImage} />
      ) : (
        <Video
          source={{ uri: item.media_url }}
          style={styles.postImage}
          resizeMode="cover"
          shouldPlay={false}
          isLooping={false}
          isMuted
        />
      )}
      {item.file_type === 'video' && (
        <View style={styles.videoIconOverlay}>
          <Ionicons name="play" size={24} color="rgba(255,255,255,0.8)" />
        </View>
      )}
    </TouchableOpacity>
  ), [userId, navigation]); // Add dependencies for useCallback

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
          <Image
            source={{ uri: profile.avatar_url || 'https://via.placeholder.com/150' }}
            style={styles.avatar}
          />
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}
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
            <TouchableOpacity
              style={[styles.followButton, isFollowing ? styles.unfollowButton : styles.followButton]}
              onPress={handleFollowToggle}
            >
              <Text style={styles.followButtonText}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.postsSectionHeader}>Posts</Text>
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
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingHorizontal: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#00BFFF',
  },
  username: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  profileBio: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 15,
    width: '100%',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  followButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 20,
  },
  unfollowButton: {
    backgroundColor: '#555',
  },
  followButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  postsSectionHeader: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 15,
    marginTop: 20,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  postTile: {
    width: width / 3,
    aspectRatio: 1,
    borderWidth: 0.5,
    borderColor: '#1a1a1a',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  videoIconOverlay: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 5,
    padding: 2,
  },
  noPostsText: {
    color: '#ccc',
    textAlign: 'center',
    marginTop: 30,
    fontSize: 16,
  },
});

export default UserProfileScreen;