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
  Alert, // Added Alert for user feedback
} from 'react-native';
import { supabase } from '../utils/supabase';
import { useNavigation, useFocusEffect } from '@react-navigation/native'; // Added useFocusEffect
import { Video } from 'expo-av'; // Only needed for preview thumbnails if not using Image directly

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
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const currentUserIdRef = useRef(null); // Ref to store current user ID

  // useFocusEffect to refetch data when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const fetchProfileAndPosts = async () => {
        setLoading(true);
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Error getting session:", sessionError.message);
          Alert.alert("Error", "Failed to get user session.");
          setLoading(false);
          return;
        }

        if (!session) {
          // If no session, perhaps navigate to login or handle unauthenticated state
          setProfile(null);
          setPosts([]);
          setFollowers(0);
          setFollowing(0);
          setLoading(false);
          return;
        }

        const userId = session.user.id;
        currentUserIdRef.current = userId; // Store user ID in ref

        try {
          // Fetch profile data
          const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (profileError) {
            console.error("Error fetching user profile:", profileError.message);
            Alert.alert("Error", "Could not load profile data.");
          } else {
            setProfile(userProfile);
          }

          // Fetch user's posts, including profiles data for VideoCard
          const { data: userPosts, error: postsError } = await supabase
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
            Alert.alert("Error", "Could not load posts.");
          } else {
            setPosts(userPosts || []);
          }

          // Fetch follower count
          const { count: followersCount, error: followersError } = await supabase
            .from('user_follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', userId);

          if (followersError) {
            console.error("Error fetching followers:", followersError.message);
          } else {
            setFollowers(followersCount || 0);
          }

          // Fetch following count
          const { count: followingCount, error: followingError } = await supabase
            .from('user_follows')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', userId);

          if (followingError) {
            console.error("Error fetching following:", followingError.message);
          } else {
            setFollowing(followingCount || 0);
          }

        } catch (error) {
          console.error("Caught error during profile fetch:", error.message);
          Alert.alert("Error", "An unexpected error occurred while loading profile.");
        } finally {
          setLoading(false);
        }
      };

      fetchProfileAndPosts();

      // Return a cleanup function if needed (e.g., for subscriptions)
      // No specific cleanup needed for these simple fetches.
    }, [])
  );

  const renderPost = ({ item, index }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('UserPostsFeed', { userId: currentUserIdRef.current, initialPostIndex: index })}
      style={styles.postTile}
    >
      {item.file_type === 'image' ? (
        <Image source={{ uri: item.media_url }} style={styles.postImage} />
      ) : (
        // For video thumbnails, you might just use an Image if you have a thumbnail URL,
        // or a paused Video component if you want the first frame.
        <Video
          source={{ uri: item.media_url }}
          style={styles.postImage}
          resizeMode="cover"
          shouldPlay={false}
          isLooping={false} // No need to loop for a static thumbnail
          isMuted // Mute preview
        />
      )}
      {/* Optional: Add an icon for video posts */}
      {item.file_type === 'video' && (
        <View style={styles.videoIconOverlay}>
          <Ionicons name="play" size={24} color="rgba(255,255,255,0.8)" />
        </View>
      )}
    </TouchableOpacity>
  );

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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.header}>
          <Image source={{ uri: profile.avatar_url || 'https://via.placeholder.com/150' }} style={styles.avatar} />
          <Text style={styles.username}>@{profile.username || 'Unnamed'}</Text>
          {profile.bio && <Text style={styles.profileBio}>{profile.bio}</Text>} {/* Added Bio */}
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
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.postsSectionHeader}>Your Posts</Text> {/* New header for posts section */}
        {posts.length > 0 ? (
          <FlatList
            data={posts}
            renderItem={renderPost}
            keyExtractor={(item) => item.id}
            numColumns={3}
            scrollEnabled={false} // Disable FlatList's own scrolling
            contentContainerStyle={styles.grid}
          />
        ) : (
          <Text style={styles.noPostsText}>You haven't posted anything yet.</Text>
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
    paddingVertical: 30,
    borderBottomWidth: 1, // Added a separator
    borderBottomColor: '#333',
    paddingHorizontal: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderColor: '#00BFFF',
    borderWidth: 2,
    marginBottom: 10,
  },
  username: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  profileBio: { // Added bio style
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 15,
    width: '100%', // Ensure it takes full width to distribute stats
    justifyContent: 'space-around', // Distribute space evenly
  },
  statBox: {
    alignItems: 'center',
    // Removed marginHorizontal to let space-around handle distribution
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
  editBtn: {
    marginTop: 20, // Increased margin for better spacing
    borderWidth: 1,
    borderColor: '#fff',
    paddingVertical: 8, // Increased padding
    paddingHorizontal: 30, // Increased padding
    borderRadius: 25, // More rounded corners
  },
  editBtnText: {
    color: '#fff',
    fontSize: 15, // Slightly larger font
    fontWeight: 'bold',
  },
  postsSectionHeader: { // Style for "Your Posts" header
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
    justifyContent: 'flex-start', // Align items to the start
  },
  postTile: {
    width: width / 3,
    aspectRatio: 1,
    borderWidth: 0.5,
    borderColor: '#1a1a1a', // Slightly darker border for grid lines
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  videoIconOverlay: { // Style for video play icon
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