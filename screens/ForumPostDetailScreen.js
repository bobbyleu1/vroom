import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Alert } from 'react-native';
import { Ionicons, Feather, AntDesign } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

// Import Supabase client
import { supabase } from '../utils/supabase';

// Utility function to format time (copied from ForumsScreen for self-containment)
const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365.25);
  return `${years}y ago`;
};

const ForumPostDetailScreen = ({ navigation, route }) => {
  const { postId } = route.params; // Get the post ID passed from previous screen

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null); // To store the authenticated user's ID

  // Function to fetch the current authenticated user's ID
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchUser();
  }, []);

  // Function to fetch post details and comments from Supabase
  const fetchPostAndComments = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch the specific post
      const { data: postData, error: postError } = await supabase
        .from('forum_posts')
        .select('*, forum_categories(name), profiles(username)')
        .eq('id', postId)
        .single();

      if (postError) {
        console.error('Error fetching post details:', postError.message); // Log full error message
        Alert.alert('Error', 'Could not load post. Please try again.');
        setPost(null);
        return;
      }

      setPost({
        ...postData,
        community_name: postData.forum_categories?.name || 'Unknown Community',
        author_username: postData.profiles?.username || 'Anonymous',
        created_at_formatted: formatTimeAgo(postData.created_at),
      });

      // Fetch comments for the post
      const { data: commentsData, error: commentsError } = await supabase
        .from('forum_comments')
        .select('*, profiles(username)') // Fetch author username for comments
        .eq('post_id', postId)
        .order('created_at', { ascending: true }); // Order comments by creation time

      if (commentsError) {
        console.error('Error fetching comments:', commentsError.message); // Log full error message
        console.error('Comments Error Details:', commentsError); // Log the entire error object for more context
        Alert.alert('Error', 'Could not load comments. Please try again.');
        setComments([]);
        return;
      }

      console.log('Fetched comments data:', commentsData); // Log the actual fetched data

      // Structure comments for nested display (if parent_comment_id is used)
      // For now, we'll display them linearly, but the structure is ready for nesting.
      const structuredComments = commentsData
        .map(comment => ({
          ...comment,
          author_username: comment.profiles?.username || 'Anonymous',
          created_at_formatted: formatTimeAgo(comment.created_at),
          // Add a 'replies' array if you implement nested replies later
          // For now, all comments are treated as top-level for display
        }));

      setComments(structuredComments);

    } catch (error) {
      console.error('Error in fetchPostAndComments (catch block):', error.message);
      Alert.alert('Error', 'An unexpected error occurred while loading. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [postId]); // Dependency on postId

  useEffect(() => {
    fetchPostAndComments();
  }, [fetchPostAndComments]);

  // Handle liking/upvoting a post
  const handleUpvotePost = async () => {
    if (!currentUserId || !post) {
      Alert.alert('Login Required', 'Please log in to upvote posts.');
      return;
    }

    // Optimistic UI update
    setPost(prevPost => ({
      ...prevPost,
      upvotes: prevPost.upvotes + 1,
    }));

    try {
      // Update the upvotes count in the forum_posts table
      const { data, error } = await supabase
        .from('forum_posts')
        .update({ upvotes: post.upvotes + 1 })
        .eq('id', postId);

      if (error) {
        console.error('Error upvoting post:', error);
        Alert.alert('Error', 'Failed to upvote post. Please try again.');
        // Revert optimistic update if error
        setPost(prevPost => ({
          ...prevPost,
          upvotes: prevPost.upvotes - 1,
        }));
      } else {
        console.log('Post upvoted successfully');
      }
    } catch (error) {
      console.error('Exception during upvote:', error.message);
      Alert.alert('Error', 'An unexpected error occurred during upvote.');
      // Revert optimistic update if error
      setPost(prevPost => ({
        ...prevPost,
        upvotes: prevPost.upvotes - 1,
      }));
    }
  };

  // Handle posting a new comment
  const handlePostComment = async () => {
    if (newComment.trim() === '' || !currentUserId || !post) {
      Alert.alert('Error', 'Comment cannot be empty and you must be logged in.');
      return;
    }

    setLoading(true); // Show loading indicator while posting
    try {
      const { data, error } = await supabase
        .from('forum_comments')
        .insert({
          post_id: postId,
          author_id: currentUserId,
          content: newComment.trim(),
          parent_comment_id: null, // For now, all new comments are top-level
        })
        .select(); // Select the inserted data to get its ID and timestamp

      if (error) {
        console.error('Error posting comment:', error);
        Alert.alert('Error', 'Failed to post comment. Please try again.');
      } else if (data && data.length > 0) {
        const postedComment = data[0];
        // Fetch the username for the newly posted comment
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', postedComment.author_id)
          .single();

        if (profileError) {
          console.error('Error fetching profile for new comment:', profileError);
          // Proceed without username if it fails, or handle as needed
        }

        const newCommentObj = {
          ...postedComment,
          author_username: profileData?.username || 'Anonymous',
          created_at_formatted: formatTimeAgo(postedComment.created_at),
          replies: [], // Initialize replies array
        };
        setComments(prevComments => [newCommentObj, ...prevComments]); // Add new comment to the top
        setNewComment(''); // Clear input field
        // Optionally, update post comment count here if not handled by a database trigger
        // For now, assuming database trigger handles forum_posts.comment_count
      }
    } catch (error) {
      console.error('Exception during comment post:', error.message);
      Alert.alert('Error', 'An unexpected error occurred while posting comment.');
    } finally {
      setLoading(false); // Hide loading indicator
    }
  };

  const renderComment = ({ item, level = 0 }) => (
    <View style={[styles.commentCard, { marginLeft: level * 20 }]}>
      <View style={styles.commentMeta}>
        <Text style={styles.commentAuthor}>{item.author_username}</Text>
        <Text style={styles.commentTime}>{item.created_at_formatted}</Text>
      </View>
      <Text style={styles.commentContent}>{item.content}</Text>
      <View style={styles.commentActions}>
        <TouchableOpacity style={styles.commentActionButton}>
          <AntDesign name="like2" size={16} color="#B0B0B0" />
          <Text style={styles.commentActionText}>{item.likes}</Text>
        </TouchableOpacity>
        {/* Reply button - currently only supports top-level comments */}
        <TouchableOpacity style={styles.commentActionButton}>
          <Text style={styles.commentActionText}>Reply</Text>
        </TouchableOpacity>
      </View>
      {/* Nested replies would be rendered here recursively if implemented */}
      {/* {item.replies && item.replies.map(reply => (
        <View key={reply.id}>
          {renderComment({ item: reply, level: level + 1 })}
        </View>
      ))} */}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00BFFF" />
          <Text style={styles.loadingText}>Loading post...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Post not found or an error occurred.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonBottom}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#00BFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{post.community_name}</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          {/* Post Content */}
          <View style={styles.postDetailCard}>
            <View style={styles.postMetaTop}>
              <Text style={styles.postCommunity}>{`v/${post.community_name}`}</Text>
              <Text style={styles.postAuthor}>Posted by u/{post.author_username}</Text>
              <Text style={styles.postTime}>{post.created_at_formatted}</Text>
            </View>
            <Text style={styles.postTitle}>{post.title}</Text>
            <Text style={styles.postContentFull}>{post.content}</Text>
            {/* Image display if post.image_urls exists */}
            {/* {post.image_urls && post.image_urls.length > 0 && (
              <Image source={{ uri: post.image_urls[0] }} style={styles.postImage} />
            )} */}
            <View style={styles.postActions}>
              <TouchableOpacity style={styles.actionButton} onPress={handleUpvotePost}>
                <AntDesign name="caretup" size={24} color="#FFF" />
                <Text style={styles.actionText}>{post.upvotes}</Text>
                <AntDesign name="caretdown" size={24} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="chatbubble-outline" size={18} color="#B0B0B0" />
                <Text style={styles.actionText}>{post.comment_count} comments</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Feather name="share" size={18} color="#B0B0B0" />
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={styles.commentsHeader}>Comments ({comments.length})</Text>
            {comments.length > 0 ? (
              comments.map(comment => (
                <View key={comment.id}>
                  {renderComment({ item: comment, level: 0 })}
                </View>
              ))
            ) : (
              <Text style={styles.noCommentsText}>No comments yet. Be the first to comment!</Text>
            )}
          </View>
        </ScrollView>

        {/* Comment Input */}
        <View style={styles.commentInputContainer}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor="#888"
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <TouchableOpacity
            style={styles.postCommentButton}
            onPress={handlePostComment}
            disabled={newComment.trim() === '' || !currentUserId} // Disable if empty or not logged in
          >
            <Text style={styles.postCommentButtonText}>Post</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  placeholder: {
    width: 38,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#B0B0B0',
    marginTop: 10,
    fontSize: 16,
  },
  backButtonBottom: {
    marginTop: 20,
    backgroundColor: '#00BFFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  backButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollViewContent: {
    padding: 15,
    paddingBottom: 100, // Ensure space for comment input
  },
  postDetailCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#00BFFF',
  },
  postMetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  postCommunity: {
    fontSize: 14,
    color: '#B0B0B0',
    fontWeight: 'bold',
    marginRight: 8,
  },
  postAuthor: {
    fontSize: 14,
    color: '#888',
    marginRight: 8,
  },
  postTime: {
    fontSize: 14,
    color: '#888',
  },
  postTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E0E0E0',
    marginBottom: 10,
  },
  postContentFull: {
    fontSize: 16,
    color: '#B0B0B0',
    lineHeight: 24,
    marginBottom: 15,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 15,
    resizeMode: 'cover',
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  actionText: {
    fontSize: 14,
    color: '#B0B0B0',
    marginLeft: 5,
    marginRight: 5,
  },
  commentsSection: {
    marginTop: 20,
  },
  commentsHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  commentCard: {
    backgroundColor: '#0A0A0A', // Even darker for comments
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#222',
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00BFFF',
    marginRight: 8,
  },
  commentTime: {
    fontSize: 12,
    color: '#888',
  },
  commentContent: {
    fontSize: 14,
    color: '#E0E0E0',
    lineHeight: 20,
    marginBottom: 8,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
  },
  commentActionText: {
    fontSize: 12,
    color: '#B0B0B0',
    marginLeft: 5,
  },
  noCommentsText: {
    color: '#B0B0B0',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#000', // Black background for input area
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    color: '#E0E0E0',
    fontSize: 16,
    maxHeight: 100, // Prevent input from getting too large
  },
  postCommentButton: {
    backgroundColor: '#00BFFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postCommentButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ForumPostDetailScreen;
