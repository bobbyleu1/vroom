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
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../utils/supabase';
import { Video } from 'expo-av'; // For video posts
import PostFormModal from '../components/PostFormModal'; // <--- ADDED THIS IMPORT
import GroupEditModal from '../components/GroupEditModal'; // <--- ADDED GROUP EDIT MODAL IMPORT
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
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // State for handling comments modal and data
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

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

  /**
   * Fetch group posts and membership status for the current user.  This
   * function is defined outside of the useEffect hook so it can be
   * referenced from multiple places (e.g. when reloading posts after
   * creating a new post).  It depends on the current groupId and
   * currentUserId state values.
   */
  const fetchPostsAndMembership = React.useCallback(async () => {
    setLoadingPosts(true);
    if (!groupId) {
      setLoadingPosts(false);
      return;
    }
    try {
      // Fetch posts
      const { data: postsData, error: postsError } = await supabase
        .from('group_posts')
        .select(
          `
            *,
            profiles:author_id (username, avatar_url)
          `
        )
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
      if (postsError) {
        throw postsError;
      }
      // Determine which posts the current user has liked
      let likedPostIds = [];
      if (currentUserId) {
        const { data: likesData, error: likesError } = await supabase
          .from('group_post_likes')
          .select('post_id')
          .eq('user_id', currentUserId);
        if (likesError) {
          console.error('Error fetching likes for user:', likesError.message);
        } else {
          likedPostIds = likesData?.map(like => like.post_id) || [];
        }
      }
      // Attach likedByUser flag to each post
      const postsWithLike = postsData.map(post => ({
        ...post,
        likedByUser: likedPostIds.includes(post.id),
      }));
      setGroupPosts(postsWithLike);

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
  }, [groupId, currentUserId]);

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

  // Fetch group posts and check membership when groupId or currentUserId changes
  useEffect(() => {
    if (groupId && currentUserId !== null) {
      fetchPostsAndMembership();
    }
  }, [groupId, currentUserId, fetchPostsAndMembership]);

  const handlePostSuccess = () => {
    fetchPostsAndMembership(); // Re-fetch posts after a successful submission
  };

  const handleGroupEditSuccess = () => {
    // Re-fetch group details after successful update
    const fetchGroupDetails = async () => {
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
        console.error('Error refetching group details:', error.message);
      }
    };

    fetchGroupDetails();
  };

  /**
   * Toggle like/unlike status for a group post.  Performs an optimistic UI
   * update and then writes the change to Supabase.  If the write fails,
   * the optimistic update is reverted.
   *
   * @param {string} postId - The ID of the post to like or unlike
   * @param {boolean} currentlyLiked - Whether the post is currently liked by the user
   */
  const toggleLike = async (postId, currentlyLiked) => {
    if (!currentUserId) {
      Alert.alert('Login Required', 'Please log in to like posts.');
      return;
    }
    // Optimistically update the UI
    setGroupPosts(prevPosts => prevPosts.map(post => {
      if (post.id === postId) {
        const newUpvotes = (post.upvotes || 0) + (currentlyLiked ? -1 : 1);
        return { ...post, likedByUser: !currentlyLiked, upvotes: newUpvotes };
      }
      return post;
    }));
    try {
      if (currentlyLiked) {
        // User is unliking the post: remove like record and decrement upvotes
        const { error: deleteError } = await supabase
          .from('group_post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', currentUserId);
        if (deleteError) throw deleteError;
        // Decrement upvotes count in group_posts table
        const { error: updateError } = await supabase
          .from('group_posts')
          .update({ upvotes: supabase.raw('upvotes - 1') })
          .eq('id', postId);
        if (updateError) throw updateError;
      } else {
        // User is liking the post: insert like record and increment upvotes
        const { error: insertError } = await supabase
          .from('group_post_likes')
          .insert({ post_id: postId, user_id: currentUserId });
        if (insertError) throw insertError;
        // Increment upvotes count in group_posts table
        const { error: updateError } = await supabase
          .from('group_posts')
          .update({ upvotes: supabase.raw('upvotes + 1') })
          .eq('id', postId);
        if (updateError) throw updateError;
      }
    } catch (error) {
      console.error('Error toggling like:', error.message);
      // Revert optimistic update on error
      setGroupPosts(prevPosts => prevPosts.map(post => {
        if (post.id === postId) {
          const revertedUpvotes = (post.upvotes || 0) + (currentlyLiked ? 1 : -1);
          return { ...post, likedByUser: currentlyLiked, upvotes: revertedUpvotes };
        }
        return post;
      }));
      Alert.alert('Error', 'Failed to update like. Please try again.');
    }
  };

  /**
   * Fetch comments for a specific post and populate the comments state.  This
   * function also handles loading state for the comments modal.
   *
   * @param {string} postId - The ID of the post for which to fetch comments
   */
  const fetchComments = async (postId) => {
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from('group_post_comments')
        .select(
          `*, profiles:author_id (username, avatar_url)`
        )
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Error fetching comments:', error.message);
      Alert.alert('Error', 'Could not load comments: ' + error.message);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  /**
   * Open the comments modal for a given post.  Fetches comments and sets
   * the selectedPost state so that new comments can be posted to the
   * correct post.
   *
   * @param {Object} post - The post object for which to show comments
   */
  const openComments = (post) => {
    setSelectedPost(post);
    fetchComments(post.id);
    setCommentsModalVisible(true);
  };

  /**
   * Handle posting a new comment to the selected post.  Inserts the comment
   * into the `group_post_comments` table and refreshes the comments list
   * on success.
   */
  const handlePostComment = async () => {
    if (!selectedPost || !currentUserId) {
      Alert.alert('Error', 'You must be logged in to comment.');
      return;
    }
    const content = newComment.trim();
    if (content.length === 0) {
      Alert.alert('Error', 'Comment cannot be empty.');
      return;
    }
    setLoadingComments(true);
    try {
      const { error } = await supabase
        .from('group_post_comments')
        .insert({
          post_id: selectedPost.id,
          author_id: currentUserId,
          content: content,
        });
      if (error) throw error;
      setNewComment('');
      // Refresh comments after posting
      fetchComments(selectedPost.id);
    } catch (error) {
      console.error('Error posting comment:', error.message);
      Alert.alert('Error', 'Failed to post comment: ' + error.message);
    } finally {
      setLoadingComments(false);
    }
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
        {/* Media Handling */}
        {item.post_type === 'video' && item.media_url && (
          <Video
            source={{ uri: item.media_url }}
            style={styles.postMedia}
            useNativeControls
            resizeMode="contain"
            isLooping
          />
        )}
        {item.post_type === 'image' && item.image_urls && item.image_urls.length > 0 && (
          item.image_urls.length === 1 ? (
            <Image source={{ uri: item.image_urls[0] }} style={styles.postMedia} />
          ) : (
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
          )
        )}


        {/* Post Actions (Like, Comment, Share) */}
        <View style={styles.postActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => toggleLike(item.id, item.likedByUser)}
          >
            <Ionicons
              name={item.likedByUser ? 'heart' : 'heart-outline'}
              size={20}
              color={item.likedByUser ? '#E0245E' : '#B0B0B0'}
            />
            <Text style={styles.actionText}>{item.upvotes || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openComments(item)}
          >
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
        <View style={styles.headerActions}>
          {/* Edit button for group owner */}
          {groupData && currentUserId === groupData.creator_id && (
            <TouchableOpacity
              style={styles.editGroupButton}
              onPress={() => setShowEditGroupModal(true)}
            >
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          {/* Create post button for members */}
          {isMember && (
            <TouchableOpacity
              style={styles.createPostButtonHeader}
              onPress={() => setShowCreatePostModal(true)}
            >
              <Ionicons name="add" size={24} color="#000" />
            </TouchableOpacity>
          )}
        </View>
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

      {/* Group Edit Modal */}
      <GroupEditModal
        visible={showEditGroupModal}
        onClose={() => setShowEditGroupModal(false)}
        groupData={groupData}
        onSuccess={handleGroupEditSuccess}
      />

      {/* Comments Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={commentsModalVisible}
        onRequestClose={() => setCommentsModalVisible(false)}
      >
        <View style={styles.commentsModalOverlay}>
          <View style={styles.commentsModalContainer}>
            {/* Header */}
            <View style={styles.commentsHeader}>
              <Text style={styles.commentsTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentsModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {/* Comments List */}
            <ScrollView style={styles.commentsList}>
              {loadingComments ? (
                <ActivityIndicator color="#00BFFF" style={{ marginTop: 20 }} />
              ) : (
                comments.map(comment => (
                  <View key={comment.id} style={styles.commentItem}>
                    <View style={styles.commentAuthorRow}>
                      <Image
                        source={{ uri: comment.profiles?.avatar_url || 'https://via.placeholder.com/40' }}
                        style={styles.commentAvatar}
                      />
                      <View style={{ marginLeft: 10 }}>
                        <Text style={styles.commentAuthor}>{comment.profiles?.username || 'Anonymous'}</Text>
                        <Text style={styles.commentTime}>{new Date(comment.created_at).toLocaleString()}</Text>
                      </View>
                    </View>
                    <Text style={styles.commentContent}>{comment.content}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            {/* Comment Input */}
            <View style={styles.commentInputContainer}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment…"
                placeholderTextColor="#888"
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
              <TouchableOpacity style={styles.commentSendButton} onPress={handlePostComment} disabled={loadingComments}>
                {loadingComments ? (
                  <ActivityIndicator color="#00BFFF" />
                ) : (
                  <Ionicons name="send" size={22} color="#00BFFF" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editGroupButton: {
    backgroundColor: '#333',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
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

  /* Comments modal styles */
  commentsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  commentsModalContainer: {
    backgroundColor: '#1C1C1E',
    padding: 15,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    maxHeight: '80%',
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  commentsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  commentsList: {
    marginBottom: 10,
  },
  commentItem: {
    marginBottom: 15,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  commentAuthor: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  commentTime: {
    color: '#888',
    fontSize: 12,
  },
  commentContent: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 50,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#333',
    paddingVertical: 5,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#333',
    color: '#fff',
    borderRadius: 8,
    padding: 10,
    marginRight: 10,
    maxHeight: 80,
  },
  commentSendButton: {
    padding: 8,
  },
  // Removed old modal styles (modalOverlay, modalContent, etc.) as they are no longer used.
});

export default GroupDetailScreen;