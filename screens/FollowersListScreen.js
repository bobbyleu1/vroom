import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { getProfileImageSource } from '../utils/profileHelpers';

const FollowersListScreen = ({ route, navigation }) => {
  const { userId, username } = route.params;
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Get current user on mount
  useEffect(() => {
    getCurrentUser();
  }, []);

  // Fetch followers when component mounts or userId changes
  useEffect(() => {
    if (currentUserId !== null) {
      fetchFollowers();
    }
  }, [userId, currentUserId]);

  const getCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setCurrentUserId(user?.id || null);
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  };

  const fetchFollowers = async () => {
    try {
      console.log('Fetching followers for user:', userId);
      
      const { data, error } = await supabase
        .from('user_follows')
        .select(`
          follower_id,
          profiles!user_follows_follower_id_fkey (
            id,
            username,
            avatar_url
          )
        `)
        .eq('following_id', userId);

      if (error) throw error;

      // Transform data and get follow status for current user
      const followersWithStatus = await Promise.all(
        (data || []).map(async (item) => {
          const follower = item.profiles;
          
          // Check if current user follows this person
          let isFollowing = false;
          if (currentUserId && currentUserId !== follower.id) {
            const { data: followData, error: followError } = await supabase
              .from('user_follows')
              .select('id')
              .eq('follower_id', currentUserId)
              .eq('following_id', follower.id)
              .single();
            
            isFollowing = !followError && followData;
          }

          return {
            id: follower.id,
            username: follower.username,
            avatar_url: follower.avatar_url,
            isFollowing,
            isCurrentUser: currentUserId === follower.id,
          };
        })
      );

      setFollowers(followersWithStatus);
    } catch (error) {
      console.error('Error fetching followers:', error);
      Alert.alert('Error', 'Failed to load followers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleFollow = async (targetUserId, isCurrentlyFollowing) => {
    if (!currentUserId) {
      Alert.alert('Error', 'Please log in to follow users');
      return;
    }

    try {
      if (isCurrentlyFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', targetUserId);

        if (error) throw error;
      } else {
        // Follow
        const { error } = await supabase
          .from('user_follows')
          .insert({
            follower_id: currentUserId,
            following_id: targetUserId,
          });

        if (error) throw error;
      }

      // Update local state
      setFollowers(prev => 
        prev.map(follower => 
          follower.id === targetUserId 
            ? { ...follower, isFollowing: !isCurrentlyFollowing }
            : follower
        )
      );
    } catch (error) {
      console.error('Error updating follow status:', error);
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  const navigateToProfile = (profileUserId) => {
    if (profileUserId === currentUserId) {
      // Navigate to own profile (main tab)
      navigation.navigate('Profile');
    } else {
      // Navigate to other user's profile
      navigation.push('UserProfile', { userId: profileUserId });
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFollowers();
  }, []);

  const renderFollower = ({ item }) => (
    <View style={styles.followerItem}>
      <TouchableOpacity 
        style={styles.followerInfo}
        onPress={() => navigateToProfile(item.id)}
      >
        <Image 
          source={getProfileImageSource(item.avatar_url)}
          style={styles.avatar}
          onError={(error) => {
            console.log('FollowersListScreen: Avatar load error:', error.nativeEvent.error);
          }}
          onLoad={() => {
            console.log('FollowersListScreen: Avatar loaded successfully');
          }}
        />
        <Text style={styles.username}>@{item.username}</Text>
      </TouchableOpacity>
      
      {!item.isCurrentUser && (
        <TouchableOpacity
          style={[
            styles.followButton,
            item.isFollowing && styles.followingButton
          ]}
          onPress={() => handleFollow(item.id, item.isFollowing)}
        >
          <Text style={[
            styles.followButtonText,
            item.isFollowing && styles.followingButtonText
          ]}>
            {item.isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color="#666" />
      <Text style={styles.emptyStateText}>No followers yet</Text>
      <Text style={styles.emptyStateSubtext}>
        When people follow {username || 'this user'}, they'll appear here
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Followers</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#00BFFF" style={styles.loader} />
      ) : (
        <FlatList
          data={followers}
          keyExtractor={(item) => item.id}
          renderItem={renderFollower}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00BFFF"
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    flexGrow: 1,
    paddingVertical: 8,
  },
  followerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
  },
  followerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
  },
  username: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  followButton: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  followButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  followingButtonText: {
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyStateText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default FollowersListScreen;