import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  ActivityIndicator,
  Animated,
  Alert,
  TouchableWithoutFeedback, // For dismissing keyboard
} from 'react-native';
import { Ionicons, AntDesign, Feather } from '@expo/vector-icons';
import { supabase } from '../utils/supabase'; // Ensure this path is correct

const { height } = Dimensions.get('window');
const MODAL_HEIGHT_RATIO = 0.85; // Increased to 85% of screen height
const MODAL_START_POSITION = height * (1 - MODAL_HEIGHT_RATIO);

// Utility function to format time (copied for self-containment)
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

// Utility function to format numbers (copied for self-containment)
const formatCount = (num) => {
  if (num === null || num === undefined) return '0';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};


const CommentsModal = ({ isVisible, onClose, postId, postCommentCount }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // { commentId, username }
  const [currentUserId, setCurrentUserId] = useState(null);
  const slideAnim = useRef(new Animated.Value(height)).current; // Initial position off-screen

  // Fetch current user ID on component mount
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchUser();
  }, []);

  // Animation for slide-up/slide-down
  useEffect(() => {
    if (isVisible) {
      Animated.timing(slideAnim, {
        toValue: MODAL_START_POSITION,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, slideAnim]);

  // Fetch comments for the given postId
  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('post_comments')
        .select('*, profiles(username)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true }); // Order by oldest first

      if (error) {
        console.error('Error fetching comments:', error.message);
        Alert.alert('Error', 'Failed to load comments.');
        setComments([]);
        return;
      }

      // Process comments to build a threaded structure
      const commentsMap = new Map();
      const rootComments = [];

      data.forEach(comment => {
        const formattedComment = {
          ...comment,
          author_username: comment.profiles?.username || 'Anonymous',
          created_at_formatted: formatTimeAgo(comment.created_at),
          replies: [],
          hasLiked: false, // Will check this later
        };
        commentsMap.set(comment.id, formattedComment);
        if (comment.parent_comment_id === null) {
          rootComments.push(formattedComment);
        }
      });

      data.forEach(comment => {
        if (comment.parent_comment_id !== null) {
          const parent = commentsMap.get(comment.parent_comment_id);
          if (parent) {
            parent.replies.push(commentsMap.get(comment.id));
          }
        }
      });

      // Sort root comments by creation time, and replies within each comment
      rootComments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      rootComments.forEach(comment => {
        comment.replies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      });

      setComments(rootComments);

      // Check like status for each comment
      if (currentUserId && data.length > 0) {
        const commentIds = data.map(c => c.id);
        const { data: likedCommentsData, error: likedCommentsError } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', currentUserId)
          .in('comment_id', commentIds);

        if (likedCommentsError) {
          console.error('Error fetching liked comments status:', likedCommentsError.message);
        } else {
          const likedCommentIds = new Set(likedCommentsData.map(lc => lc.comment_id));
          setComments(prevComments =>
            prevComments.map(comment => ({
              ...comment,
              hasLiked: likedCommentIds.has(comment.id),
              replies: comment.replies.map(reply => ({
                ...reply,
                hasLiked: likedCommentIds.has(reply.id),
              })),
            }))
          );
        }
      }

    } catch (error) {
      console.error('Exception in fetchComments:', error.message);
      Alert.alert('Error', 'An unexpected error occurred while fetching comments.');
    } finally {
      setLoading(false);
    }
  }, [postId, currentUserId]);

  useEffect(() => {
    if (isVisible && postId) {
      fetchComments();
    }
  }, [isVisible, postId, fetchComments]);

  const handlePostComment = async () => {
    if (newCommentContent.trim() === '' || !currentUserId) {
      Alert.alert('Error', 'Comment cannot be empty and you must be logged in.');
      return;
    }

    setLoading(true); // Show loading indicator while posting
    try {
      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          author_id: currentUserId,
          content: newCommentContent.trim(),
          parent_comment_id: replyingTo ? replyingTo.commentId : null,
        })
        .select(); // Select the inserted data to get its ID and timestamp

      if (error) {
        console.error('Error posting comment:', error.message);
        Alert.alert('Error', 'Failed to post comment. Please try again.');
      } else if (data && data.length > 0) {
        const postedComment = data[0];
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', postedComment.author_id)
          .single();

        if (profileError) {
          console.error('Error fetching profile for new comment:', profileError.message);
        }

        const newCommentObj = {
          ...postedComment,
          author_username: profileData?.username || 'Anonymous',
          created_at_formatted: formatTimeAgo(postedComment.created_at),
          replies: [],
          hasLiked: false, // New comment is not liked by default
        };

        if (replyingTo) {
          // Find parent and add reply
          setComments(prevComments => {
            const updatedComments = [...prevComments];
            const findAndAddReply = (commentsArray) => {
              for (let i = 0; i < commentsArray.length; i++) {
                if (commentsArray[i].id === replyingTo.commentId) {
                  commentsArray[i].replies.unshift(newCommentObj); // Add to top of replies
                  return true;
                }
                if (commentsArray[i].replies.length > 0 && findAndAddReply(commentsArray[i].replies)) {
                  return true;
                }
              }
              return false;
            };
            findAndAddReply(updatedComments);
            return updatedComments;
          });
        } else {
          setComments(prevComments => [newCommentObj, ...prevComments]); // Add top-level comment to the top
        }

        setNewCommentContent('');
        setReplyingTo(null); // Clear replying state
        // The post's comment_count is assumed to be updated by a Supabase trigger.
      }
    } catch (error) {
      console.error('Exception during comment post:', error.message);
      Alert.alert('Error', 'An unexpected error occurred while posting comment.');
    } finally {
      setLoading(false);
    }
  };

  // Handle liking/unliking a comment
  const handleLikeComment = async (commentId, currentLikes, hasLikedStatus) => {
    if (!currentUserId) {
      Alert.alert('Login Required', 'Please log in to like comments.');
      return;
    }

    // Optimistic UI update
    setComments(prevComments => {
      const updateCommentLikes = (commentsArray) => {
        return commentsArray.map(comment => {
          if (comment.id === commentId) {
            return {
              ...comment,
              likes: currentLikes + (hasLikedStatus ? -1 : 1),
              hasLiked: !hasLikedStatus,
            };
          }
          return {
            ...comment,
            replies: updateCommentLikes(comment.replies || []),
          };
        });
      };
      return updateCommentLikes(prevComments);
    });

    try {
      if (hasLikedStatus) {
        // Unlike comment
        const { error } = await supabase
          .from('comment_likes')
          .delete()
          .eq('user_id', currentUserId)
          .eq('comment_id', commentId);

        if (error) {
          console.error('Error unliking comment:', error.message);
          Alert.alert('Error', 'Failed to unlike comment. Please try again.');
          // Revert optimistic update
          setComments(prevComments => {
            const updateCommentLikes = (commentsArray) => {
              return commentsArray.map(comment => {
                if (comment.id === commentId) {
                  return {
                    ...comment,
                    likes: currentLikes,
                    hasLiked: hasLikedStatus,
                  };
                }
                return {
                  ...comment,
                  replies: updateCommentLikes(comment.replies || []),
                };
              });
            };
            return updateCommentLikes(prevComments);
          });
        }
      } else {
        // Like comment
        const { error } = await supabase
          .from('comment_likes')
          .insert({ user_id: currentUserId, comment_id: commentId });

        if (error) {
          console.error('Error liking comment:', error.message);
          Alert.alert('Error', 'Failed to like comment. Please try again.');
          // Revert optimistic update
          setComments(prevComments => {
            const updateCommentLikes = (commentsArray) => {
              return commentsArray.map(comment => {
                if (comment.id === commentId) {
                  return {
                    ...comment,
                    likes: currentLikes,
                    hasLiked: hasLikedStatus,
                  };
                }
                return {
                  ...comment,
                  replies: updateCommentLikes(comment.replies || []),
                };
              });
            };
            return updateCommentLikes(prevComments);
          });
        }
      }
    } catch (error) {
      console.error('Exception during comment like/unlike:', error.message);
      Alert.alert('Error', 'An unexpected error occurred.');
      // Revert optimistic update
      setComments(prevComments => {
        const updateCommentLikes = (commentsArray) => {
          return commentsArray.map(comment => {
            if (comment.id === commentId) {
              return {
                ...comment,
                likes: currentLikes,
                hasLiked: hasLikedStatus,
              };
            }
            return {
              ...comment,
              replies: updateCommentLikes(comment.replies || []),
            };
          });
        };
        return updateCommentLikes(prevComments);
      });
    }
  };

  const renderComment = ({ item, level = 0 }) => (
    <View style={[styles.commentCard, { marginLeft: level * 15 }]}>
      <View style={styles.commentMeta}>
        <Text style={styles.commentAuthor}>{item.author_username}</Text>
        <Text style={styles.commentTime}>{item.created_at_formatted}</Text>
      </View>
      <Text style={styles.commentContent}>{item.content}</Text>
      <View style={styles.commentActions}>
        <TouchableOpacity
          style={styles.commentActionButton}
          onPress={() => handleLikeComment(item.id, item.likes, item.hasLiked)}
        >
          <AntDesign name="heart" size={16} color={item.hasLiked ? 'red' : '#B0B0B0'} />
          <Text style={styles.commentActionText}>{formatCount(item.likes)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.commentActionButton}
          onPress={() => setReplyingTo({ commentId: item.id, username: item.author_username })}
        >
          <Text style={styles.commentActionText}>Reply</Text>
        </TouchableOpacity>
      </View>
      {item.replies && item.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {item.replies.map(reply => (
            <View key={reply.id}>
              {renderComment({ item: reply, level: level + 1 })}
            </View>
          ))}
        </View>
      )}
    </View>
  );

  if (!isVisible) return null; // Don't render anything if not visible

  return (
    <Animated.View style={[styles.modalOverlay, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.touchOutsideArea} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.commentsCountText}>Comments {postCommentCount}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Comments List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00BFFF" />
            <Text style={styles.loadingText}>Loading comments...</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            renderItem={renderComment}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.commentsList}
            ListEmptyComponent={
              <Text style={styles.noCommentsText}>No comments yet. Be the first to comment!</Text>
            }
          />
        )}

        {/* Comment Input */}
        <View style={styles.commentInputContainer}>
          <TextInput
            style={styles.commentInput}
            placeholder={replyingTo ? `Replying to @${replyingTo.username}...` : "Add a comment..."}
            placeholderTextColor="#888"
            value={newCommentContent}
            onChangeText={setNewCommentContent}
            multiline
            // Increased minHeight to make the comment box larger
            minHeight={Platform.OS === 'ios' ? 40 : 50} 
            maxHeight={120} // Allow it to expand for longer input
          />
          {replyingTo && (
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.cancelReplyButton}>
              <Text style={styles.cancelReplyText}>Cancel Reply</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.postCommentButton}
            onPress={handlePostComment}
            disabled={newCommentContent.trim() === '' || !currentUserId || loading}
          >
            <Text style={styles.postCommentButtonText}>Post</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Dim background
    justifyContent: 'flex-end', // Align modal to bottom
    zIndex: 1000, // Ensure it's on top
  },
  touchOutsideArea: {
    flex: 1, // Area above the modal that dismisses it
  },
  modalContainer: {
    backgroundColor: '#0A0A0A', // Dark background for the modal
    width: '100%',
    height: height * MODAL_HEIGHT_RATIO, // 85% of screen height
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 30 : 0, // Adjust for iPhone X bottom bar
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  commentsCountText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
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
  commentsList: {
    flex: 1, // Allow FlatList to take up available space
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  commentCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#00BFFF', // Blue border for comments
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00BFFF', // Blue for author
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
  repliesContainer: {
    marginTop: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#444',
    paddingLeft: 10,
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
    backgroundColor: '#0A0A0A', // Same as modal background
    // Removed position: 'absolute' and bottom: 0
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    color: '#E0E0E0',
    fontSize: 16,
    // Adjusted minHeight and maxHeight for better sizing
    minHeight: 40,
    maxHeight: 120,
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
  cancelReplyButton: {
    marginRight: 10,
    padding: 8,
    borderRadius: 15,
    backgroundColor: '#555',
  },
  cancelReplyText: {
    color: '#FFF',
    fontSize: 12,
  },
});

export default CommentsModal;
