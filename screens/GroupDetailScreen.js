// screens/GroupDetailScreen.js

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Dimensions,
  Platform,
  Alert,
  // Removed 'Modal' from here as it's no longer needed for the post form
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../utils/supabase';
import { Video } from 'expo-av'; // For video posts
import PostFormModal from '../components/PostFormModal'; // <--- ADDED THIS IMPORT
// Import the native ad card to display advertisements within the group posts
import NativeAdCard from '../components/NativeAdCard';

const { width } = Dimensions.get('window');

function GroupDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { groupId } = route.params;

  const [groupData, setGroupData] = useState(null);
  const [groupPosts, setGroupPosts] = useState([]);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Frequency for inserting ads into group posts. An ad appears after
  // every ADS_FREQUENCY posts. Adjust this value to modify ad density.
  const ADS_FREQUENCY = 8;

  /**
   * Inserts ad marker objects into the list of group posts at a
   * specified interval. These markers are replaced with native ads
   * during rendering. Using a separate helper function keeps the main
   * logic clean and makes it easy to modify the frequency globally.
   *
   * @param {Array} arr - array of group posts
   * @returns {Array} array with ad markers inserted
   */
  const insertAdMarkers = (arr) => {
    const result = [];
    arr.forEach((item, index) => {
      result.push(item);
      if ((index + 1) % ADS_FREQUENCY === 0) {
        result.push({ isAd: true });
      }
    });
    return result;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchUserData();
  }, []);

  // Fetch group details
  useEffect(() => {
    const fetchGroupDetails = async () => {
      setLoadingGroup(true);
      try {
        const { data, error } = await supabase
          .from('groups')
          .select(`
            *,
            profiles:creator_id (username)
          `)
          .eq('id', groupId)
          .single();

        if (error) {
          throw error;
        }
        setGroupData(data);
      } catch (error) {
        console.error('Error fetching group details:', error.message);
        Alert.alert('Error', 'Could not load group details: ' + error.message);
      } finally {
        setLoadingGroup(false);
      }
    };

    if (groupId) {
      fetchGroupDetails();
    }
  }, [groupId]);

  // Fetch group posts and check membership
  useEffect(() => {
    const fetchPostsAndMembership = async () => {
      setLoadingPosts(true);
      if (!groupId) {
        setLoadingPosts(false);
        return;
      }

      try {
        // Fetch posts
        const { data: postsData, error: postsError } = await supabase
          .from('group_posts')
          .select(`
            *,
            profiles:author_id (username, avatar_url)
          `)
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });

        if (postsError) {
          throw postsError;
        }
        setGroupPosts(postsData);

        // Check membership
        if (currentUserId) {
          const { data: membershipData, error: membershipError } = await supabase
            .from('group_members')
            .select('id')
            .eq('group_id', groupId)
            .eq('user_id', currentUserId)
            .maybeSingle();

          if (membershipError) throw membershipError;
          setIsMember(!!membershipData);
        }

      } catch (error) {
        console.error('Error fetching group posts or membership:', error.message);
        Alert.alert('Error', 'Could not load group posts or check membership: ' + error.message);
        setGroupPosts([]);
        setIsMember(false);
      } finally {
        setLoadingPosts(false);
      }
    };

    if (groupId && (currentUserId !== null)) {
      fetchPostsAndMembership();
    }
  }, [groupId, currentUserId]);

  const handlePostSuccess = () => {
    fetchPostsAndMembership(); // Re-fetch posts after a successful submission
  };

  const renderPostCard = ({ item }) => {
    // When encountering an ad marker, render the native ad card instead of a post
    if (item.isAd) {
      return <NativeAdCard />;
    }
    const postDate = new Date(item.created_at).toLocaleDateString();
    return (
      <View style={styles.postCard}>
        {/* Post Header */}
        <View style={styles.postHeader}>
          <Image
            source={{ uri: item.profiles?.avatar_url || 'https://via.placeholder.com/50' }}
            style={styles.postAvatar}
          />
          <View>
            <Text style={styles.postAuthor}>{item.profiles?.username || 'Unknown User'}</Text>
            <Text style={styles.postDate}>{postDate}</Text>
          </View>
          {/* Post Type Icon */}
          <View style={styles.postTypeIcon}>
            {item.post_type === 'text' && <Ionicons name="text" size={16} color="#00BFFF" />}
            {item.post_type === 'image' && <Ionicons name="image" size={16} color="#00BFFF" />}
            {item.post_type === 'video' && <Ionicons name="videocam" size={16} color="#00BFFF" />}
          </View>
        </View>

        {/* Post Content */}
        <Text style={styles.postTitle}>{item.title}</Text>
        {item.content && <Text style={styles.postText}>{item.content}</Text>}

        {/* Media (Image or Video) */}
        {item.media_url && item.post_type === 'image' && (
          <Image source={{ uri: item.media_url }} style={styles.postMedia} />
        )}
        {item.media_url && item.post_type === 'video' && (
          <Video
            source={{ uri: item.media_url }}
            style={styles.postMedia}
            useNativeControls
            resizeMode="contain"
            isLooping
          />
        )}
        {item.image_urls && item.image_urls.length > 0 && item.post_type === 'image' && (
          <FlatList
            data={item.image_urls}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, index) => index.toString()}
            renderItem={({ item: imageUrl }) => (
              <Image source={{ uri: imageUrl }} style={styles.postMultiImage} />
            )}
            style={styles.postMultiImageContainer}
          />
        )}


        {/* Post Actions (Likes, Comments, Share) */}
        <View style={styles.postActions}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="heart-outline" size={20} color="#B0B0B0" />
            <Text style={styles.actionText}>{item.upvotes || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="chatbubble-outline" size={20} color="#B0B0B0" />
            <Text style={styles.actionText}>{item.comment_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="share-social-outline" size={20} color="#B0B0B0" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const GroupInfoBanner = () => {
    if (!groupData) return null;
    return (
      <View style={styles.groupInfoContainer}>
        {/* Banner Image */}
        <Image
          source={{ uri: groupData.banner_url || 'https://via.placeholder.com/400x150/333/888?text=Group+Banner' }}
          style={styles.bannerImage}
        />
        {/* Profile Picture (Overlay) */}
        <Image
          source={{ uri: groupData.profile_picture_url || 'https://via.placeholder.com/100/00BFFF/FFFFFF?text=GP' }}
          style={styles.profilePicture}
        />
        {/* Group Name & Info */}
        <View style={styles.groupHeaderContent}>
          <Text style={styles.groupDetailName}>{groupData.name}</Text>
          <Text style={styles.groupDescriptionText}>{groupData.description}</Text>
          <View style={styles.groupStatsRow}>
            <Ionicons name="people" size={16} color="#B0B0B0" />
            <Text style={styles.groupStatsText}>{groupData.member_count || 0} members</Text>
            {groupData.profiles?.username && (
              <>
                <Ionicons name="person" size={16} color="#B0B0B0" style={{ marginLeft: 15 }} />
                <Text style={styles.groupStatsText}>Created by {groupData.profiles.username}</Text>
              </>
            )}
          </View>
        </View>

        {/* Allowed Posts Section */}
        <View style={styles.allowedPostsContainer}>
          <Text style={styles.allowedPostsTitle}>Allowed posts:</Text>
          <View style={styles.allowedPostsTypes}>
            {groupData.allow_text_posts && (
              <View style={styles.postTypeBadge}>
                <Ionicons name="text" size={16} color="#fff" />
                <Text style={styles.postTypeText}>Text</Text>
              </View>
            )}
            {groupData.allow_image_posts && (
              <View style={styles.postTypeBadge}>
                <Ionicons name="image" size={16} color="#fff" />
                <Text style={styles.postTypeText}>Images</Text>
              </View>
            )}
            {groupData.allow_video_posts && (
              <View style={styles.postTypeBadge}>
                <Ionicons name="videocam" size={16} color="#fff" />
                <Text style={styles.postTypeText}>Videos</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loadingGroup || loadingPosts) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.loadingText}>Loading Group...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header - Fixed to top */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{groupData?.name || 'Group'}</Text>
        {isMember && (
          <TouchableOpacity
            style={styles.createPostButtonHeader}
            onPress={() => setShowCreatePostModal(true)}
          >
            <Ionicons name="add" size={24} color="#000" />
          </TouchableOpacity>
        )}
      </View>

      {/* Main content (Group Info + Posts) - Scrollable */}
      <FlatList
        data={insertAdMarkers(groupPosts)}
        renderItem={renderPostCard}
        keyExtractor={(item, index) => (item.isAd ? `ad-${index}` : item.id)}
        contentContainerStyle={styles.postsListContent}
        ListHeaderComponent={GroupInfoBanner}
        ListEmptyComponent={
          <View style={styles.noPostsContainer}>
            <MaterialCommunityIcons name="chat-question-outline" size={60} color="#B0B0B0" />
            <Text style={styles.noPostsText}>No posts yet</Text>
            <Text style={styles.noPostsSubText}>Be the first to share something with the group!</Text>
            {isMember && (
              <TouchableOpacity style={styles.createPostButtonEmpty} onPress={() => setShowCreatePostModal(true)}>
                <Ionicons name="add" size={20} color="#000" />
                <Text style={styles.createPostButtonText}>Create Post</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Create Post Modal (using the custom component) */}
      <PostFormModal
        visible={showCreatePostModal}
        onClose={() => setShowCreatePostModal(false)}
        onSuccess={handlePostSuccess} // Pass the function to re-fetch posts
        groupId={groupId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'android' ? 40 : 60, // Adjust for status bar on different platforms
    paddingBottom: 15,
    backgroundColor: '#000',
    width: '100%', // Ensure it spans full width
  },
  backButton: {
    padding: 5,
    // No specific marginRight as space-between handles distribution
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1, // Allows title to take available space
    textAlign: 'center', // Centers the title within its flex space
    // No explicit margins needed here due to flex: 1 and space-between
  },
  createPostButtonHeader: {
    backgroundColor: '#00BFFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postsListContent: {
    paddingBottom: 20,
  },
  groupInfoContainer: {
    backgroundColor: '#1C1C1E',
    marginBottom: 15,
    paddingBottom: 15,
  },
  bannerImage: {
    width: '100%',
    height: width * 0.4,
    resizeMode: 'cover',
  },
  profilePicture: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#000',
    position: 'absolute',
    top: width * 0.4 - 45,
    left: 20,
    zIndex: 1,
  },
  groupHeaderContent: {
    paddingHorizontal: 20,
    marginTop: 50,
  },
  groupDetailName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  groupDescriptionText: {
    color: '#B0B0B0',
    fontSize: 14,
    marginBottom: 10,
  },
  groupStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  groupStatsText: {
    color: '#B0B0B0',
    fontSize: 14,
    marginLeft: 5,
  },
  allowedPostsContainer: {
    paddingHorizontal: 20,
  },
  allowedPostsTitle: {
    color: '#B0B0B0',
    fontSize: 14,
    marginBottom: 5,
  },
  allowedPostsTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  postTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 15,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  postTypeText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 5,
  },
  postCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginHorizontal: 15,
    marginBottom: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#00BFFF',
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
    elevation: 3,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  postAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  postAuthor: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  postDate: {
    color: '#B0B0B0',
    fontSize: 12,
  },
  postTypeIcon: {
    marginLeft: 'auto',
  },
  postTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 5,
  },
  postText: {
    color: '#E0E0E0',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  postMedia: {
    width: '100%',
    height: width * 0.6,
    borderRadius: 8,
    marginTop: 10,
    resizeMode: 'cover',
  },
  postMultiImageContainer: {
    marginTop: 10,
  },
  postMultiImage: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: 8,
    marginRight: 10,
    resizeMode: 'cover',
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    paddingTop: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
  },
  actionText: {
    color: '#B0B0B0',
    marginLeft: 5,
    fontSize: 14,
  },
  noPostsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    marginTop: 50,
  },
  noPostsText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  noPostsSubText: {
    color: '#B0B0B0',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 20,
  },
  createPostButtonEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00BFFF',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  createPostButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  // Removed old modal styles (modalOverlay, modalContent, etc.) as they are no longer used.
});

export default GroupDetailScreen;