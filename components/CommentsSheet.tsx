import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Animated,
  PanResponder,
  Modal,
  Pressable,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import { useHideTabBar } from '../hooks/useTabBarVisibility';
import { useScrollLock } from '../contexts/ScrollLockContext';
import { toCount, inc } from '../utils/number';
import { uniqById, upsertById } from '../utils/uniq';
import { CommentInputBar } from './CommentInputBar';
import { notifyPostComment, notifyCommentLike } from '../utils/notificationHelpers';
import { useKeyboardInset } from '../src/ui/useKeyboardInset';

const { height } = Dimensions.get('window');

interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  body?: string;
  created_at: string;
  updated_at?: string;
  parent_comment_id?: string;
  like_count: number;
  dislike_count?: number;
  is_deleted?: boolean;
  visibility?: string;
  reports_count?: number;
  author_username?: string;
  author_avatar?: string;
  created_at_formatted?: string;
  hasLiked?: boolean;
  likes?: number;
  profiles?: {
    username: string;
    avatar_url: string;
  };
}

interface CommentSummary {
  display_count: number;
  top_level_count: number;
}

interface CommentsSheetProps {
  visible: boolean;
  postId: string;
  postOwnerId?: string;
  onClose: () => void;
}

// Utility function to format time
const formatTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

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

// Utility function to format numbers
const formatCount = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

// Utility function to sort comments with replies grouped under parent comments
const sortCommentsWithReplies = (comments: Comment[]): Comment[] => {
  const topLevelComments: Comment[] = [];
  const replies: Comment[] = [];
  
  // Separate top-level comments from replies
  comments.forEach(comment => {
    if (comment.parent_comment_id) {
      replies.push(comment);
    } else {
      topLevelComments.push(comment);
    }
  });
  
  // Sort top-level comments by creation date (newest first)
  topLevelComments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  
  // Build the final list with replies grouped under their parents
  const result: Comment[] = [];
  
  topLevelComments.forEach(parent => {
    result.push(parent);
    
    // Find replies to this parent comment and sort them by date (oldest first)
    const parentReplies = replies
      .filter(reply => reply.parent_comment_id === parent.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    result.push(...parentReplies);
  });
  
  return result;
};

export default function CommentsSheet({ visible, postId, postOwnerId, onClose }: CommentsSheetProps) {
  const insets = useSafeAreaInsets();
  const { keyboardInsetAnim } = useKeyboardInset();
  const { setLocked } = useScrollLock();
  useHideTabBar(visible);

  // State
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [commentSummary, setCommentSummary] = useState<CommentSummary>({ display_count: 0, top_level_count: 0 });
  const [pendingSend, setPendingSend] = useState(false);
  const [nextCursor, setNextCursor] = useState<{ created_at: string; id: string } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  const listRef = useRef<FlatList>(null);

  // Animation - Make it slightly shorter to account for keyboard
  const snapHeight = Math.round(height * 0.7);
  const translateY = useRef(new Animated.Value(snapHeight)).current;

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

  // Lock when visible, unlock on close/unmount
  useEffect(() => {
    if (visible) setLocked(true);
    else setLocked(false);
    return () => setLocked(false);
  }, [visible, setLocked]);

  // Open/close animations
  useEffect(() => {
    Animated.spring(translateY, { 
      toValue: visible ? 0 : snapHeight, 
      useNativeDriver: true, 
      bounciness: 6 
    }).start(() => {
      if (!visible) translateY.setValue(snapHeight);
    });
  }, [visible, snapHeight, translateY]);

  // PanResponder: drag down to close
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 1.2) {
          onClose();
        } else {
          Animated.spring(translateY, { 
            toValue: 0, 
            useNativeDriver: true, 
            bounciness: 4 
          }).start();
        }
      },
    })
  ).current;

  // Fetch comment summary using new RPC
  const fetchCommentSummary = useCallback(async () => {
    if (!postId || !currentUserId) return;
    
    try {
      const { data, error } = await supabase.rpc('get_comment_summary', {
        post_id: postId,
        viewer_id: currentUserId
      });

      if (error) {
        console.error('Error fetching comment summary:', error);
        return;
      }

      if (data && data.length > 0) {
        const summary = data[0];
        setCommentSummary({
          display_count: toCount(summary.display_count),
          top_level_count: toCount(summary.top_level_count)
        });
      }
    } catch (error) {
      console.error('Exception in fetchCommentSummary:', error);
    }
  }, [postId, currentUserId]);

  // Fetch comments using new RPC with keyset pagination
  const fetchComments = useCallback(async (loadMore = false) => {
    if (!postId || !currentUserId) return;
    
    if (!loadMore) setLoading(true);
    else setLoadingMore(true);
    
    try {
      const { data, error } = await supabase.rpc('list_comments', {
        post_id: postId,
        viewer_id: currentUserId,
        after_created: loadMore ? nextCursor?.created_at : null,
        after_id: loadMore ? nextCursor?.id : null,
        page_size: 50,
        top_level_only: false
      });

      if (error) {
        console.error('Error fetching comments:', error);
        return;
      }

      if (!data || !Array.isArray(data)) {
        console.error('Invalid comment data received:', data);
        return;
      }

      // Check if there's a next cursor (indicating more comments)
      const hasNextCursor = data.length > 0 && data[0].next_cursor_created && data[0].next_cursor_id;
      setHasMore(!!hasNextCursor);
      
      if (hasNextCursor) {
        setNextCursor({
          created_at: data[0].next_cursor_created!,
          id: data[0].next_cursor_id!
        });
      }

      // Get author profiles separately to avoid JOIN issues
      const authorIds = [...new Set(data.map(c => c.author_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', authorIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Get user's likes for these comments
      const commentIds = data.map(c => c.id);
      const { data: userLikes } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', currentUserId)
        .in('comment_id', commentIds);

      const likedCommentIds = new Set(userLikes?.map(like => like.comment_id) || []);

      const processedComments = data.map(comment => {
        const profile = profileMap.get(comment.author_id);
        return {
          ...comment,
          author_username: profile?.username || 'Anonymous',
          author_avatar: profile?.avatar_url,
          created_at_formatted: formatTimeAgo(comment.created_at),
          hasLiked: likedCommentIds.has(comment.id),
          likes: toCount(comment.like_count),
          profiles: profile
        };
      });

      // Sort comments to group replies with their parent comments
      const sortedComments = sortCommentsWithReplies(processedComments);

      if (loadMore) {
        setComments(prev => uniqById([...prev, ...sortedComments]));
      } else {
        setComments(uniqById(sortedComments));
      }

    } catch (error) {
      console.error('Exception in fetchComments:', error);
    } finally {
      if (loadMore) setLoadingMore(false);
      else setLoading(false);
    }
  }, [postId, currentUserId, nextCursor]);

  // Load initial data when sheet opens
  useEffect(() => {
    if (visible && postId && currentUserId) {
      console.log('📖 CommentsSheet opened for postId:', postId);
      console.log('👤 Current user ID:', currentUserId);
      
      // Reset pagination state
      setNextCursor(null);
      setHasMore(false);
      
      // Fetch both summary and comments
      fetchCommentSummary();
      fetchComments(false);
    }
  }, [visible, postId, currentUserId, fetchCommentSummary, fetchComments]);

  // Realtime subscription with proper deduplication
  useEffect(() => {
    if (!visible || !postId) return;

    const commentCommentsSet = new Set<string>();

    const sub = supabase
      .channel(`comments:${postId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'post_comments', 
        filter: `post_id=eq.${postId}` 
      }, payload => {
        const row = payload.new as Comment;
        
        // Prevent duplicates
        if (commentCommentsSet.has(row.id)) return;
        commentCommentsSet.add(row.id);
        
        console.log('Realtime INSERT comment:', row);
        
        // Re-fetch summary to get accurate count
        fetchCommentSummary();
        
        // Get profile info for the new comment
        supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', row.author_id)
          .single()
          .then(({ data: profile }) => {
            const newComment: Comment = {
              ...row,
              author_username: profile?.username || 'Anonymous',
              author_avatar: profile?.avatar_url,
              created_at_formatted: formatTimeAgo(row.created_at),
              hasLiked: false,
              likes: toCount(row.like_count),
              profiles: profile
            };

            setComments(prev => {
              // Remove any matching temp comments and upsert real row
              const withoutTemp = prev.filter(c => 
                !c.id.startsWith('temp_') || 
                !(c.content === row.content && c.author_id === row.author_id)
              );
              const updatedComments = upsertById(withoutTemp, newComment);
              // Re-sort to maintain proper reply positioning
              return sortCommentsWithReplies(updatedComments);
            });
          });
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'post_comments', 
        filter: `post_id=eq.${postId}` 
      }, () => {
        // Re-fetch summary on any updates (like visibility changes)
        fetchCommentSummary();
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'post_comments', 
        filter: `post_id=eq.${postId}` 
      }, payload => {
        const deletedId = payload.old.id;
        setComments(prev => prev.filter(c => c.id !== deletedId));
        fetchCommentSummary();
      })
      .subscribe();

    return () => {
      sub.unsubscribe();
    };
  }, [visible, postId, fetchCommentSummary]);

  const toggleCommentLike = async (commentId: string) => {
    if (!currentUserId) return;

    const idx = comments.findIndex(c => c.id === commentId);
    if (idx < 0) return;

    const comment = comments[idx];
    const nextLiked = !comment.hasLiked;

    // Optimistic UI update
    const nextCount = inc(comment.likes || 0, nextLiked ? 1 : -1);
    setComments(prev => {
      const copy = [...prev];
      copy[idx] = { 
        ...comment, 
        hasLiked: nextLiked, 
        likes: nextCount,
        like_count: nextCount 
      };
      return copy;
    });

    try {
      if (nextLiked) {
        // Like the comment
        const { error: likeError } = await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: currentUserId });
          
        if (!likeError) {
          // Increment the count in the database
          await supabase.rpc('bump_comment_like_count', { 
            p_comment_id: commentId, 
            p_delta: 1 
          });
          // Send push notification to comment owner
          await notifyCommentLike(commentId, currentUserId, comment.author_id);
        } else {
          console.error('Error liking comment:', likeError.message);
          // Rollback on error
          setComments(prev => {
            const copy = [...prev];
            copy[idx] = { ...comment, hasLiked: false, likes: toCount(comment.likes) };
            return copy;
          });
        }
      } else {
        // Unlike the comment
        const { error: unlikeError } = await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', currentUserId);
          
        if (!unlikeError) {
          // Decrement the count in the database
          await supabase.rpc('bump_comment_like_count', { 
            p_comment_id: commentId, 
            p_delta: -1 
          });
        } else {
          console.error('Error unliking comment:', unlikeError.message);
          // Rollback on error
          setComments(prev => {
            const copy = [...prev];
            copy[idx] = { ...comment, hasLiked: true, likes: toCount(comment.likes) };
            return copy;
          });
        }
      }
    } catch (error) {
      console.error('Exception toggling like:', error);
      // Rollback on exception
      setComments(prev => {
        const copy = [...prev];
        copy[idx] = { ...comment, hasLiked: comment.hasLiked, likes: toCount(comment.likes) };
        return copy;
      });
    }
  };

  const handleSend = async (text: string) => {
    console.log('🚀 handleSend called with text:', text);
    if (pendingSend) return;
    setPendingSend(true);

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) { 
      setPendingSend(false); 
      Alert.alert('Error', 'You must be logged in to comment.');
      return; 
    }

    // Generate temporary ID for optimistic update
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const optimistic: Comment = {
      id: tempId,
      post_id: postId,
      author_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      parent_comment_id: replyingTo ? replyingTo.commentId : undefined,
      like_count: 0,
      likes: 0,
      hasLiked: false,
      author_username: 'You', // Will be replaced with real data
      author_avatar: undefined,
      created_at_formatted: 'now',
      profiles: {
        username: 'You',
        avatar_url: ''
      }
    };

    // Optimistic append + scroll (don't update count - let realtime handle it)
    console.log('Adding optimistic comment:', optimistic);
    setComments(prev => {
      const updated = [optimistic, ...prev];
      return sortCommentsWithReplies(updated);
    });
    
    // Scroll to show new comment
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    });

    try {
      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          author_id: user.id,
          content: text,
          body: text, // Use body field as canonical content
          parent_comment_id: replyingTo ? replyingTo.commentId : null,
        })
        .select('*, profiles(username, avatar_url)')
        .single();

      if (error || !data) {
        console.error('Supabase insert error:', error);
        throw error;
      }

      console.log('Comment inserted successfully:', data);
      
      // Replace temp with server data
      const serverComment: Comment = {
        ...data,
        author_username: data.profiles?.username || 'Anonymous',
        author_avatar: data.profiles?.avatar_url,
        created_at_formatted: formatTimeAgo(data.created_at),
        hasLiked: false,
        likes: toCount(data.like_count),
      };

      setComments(prev => prev.map(c => c.id === tempId ? serverComment : c));
      setReplyingTo(null);
      
      // Send push notification to post owner
      if (postOwnerId && user.id !== postOwnerId) {
        await notifyPostComment(postId, user.id, postOwnerId);
      }
      
    } catch (error) {
      console.error('Error sending comment:', error);
      // Rollback optimistic update
      setComments(prev => prev.filter(c => c.id !== tempId));
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setPendingSend(false);
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      fetchComments(true);
    }
  };

  const renderComment = ({ item }: { item: Comment }) => {
    const isReply = !!item.parent_comment_id;
    
    return (
      <View style={[
        styles.commentCard, 
        isReply && styles.replyCard
      ]}>
        {isReply && <View style={styles.replyIndicatorLine} />}
        <View style={styles.commentHeader}>
          {item.author_avatar ? (
            <Image source={{ uri: item.author_avatar }} style={styles.commentAvatar} />
          ) : (
            <View style={styles.commentAvatarPlaceholder}>
              <Ionicons name="person" size={16} color="#888" />
            </View>
          )}
          <View style={styles.commentMeta}>
            <Text style={styles.commentAuthor}>{item.author_username}</Text>
            <Text style={styles.commentTime}>{item.created_at_formatted}</Text>
            {isReply && <Text style={styles.replyLabel}>↳ Reply</Text>}
          </View>
        </View>
        <Text style={styles.commentContent}>{item.content}</Text>
        <View style={styles.commentActions}>
          <TouchableOpacity 
            style={styles.commentActionButton}
            onPress={() => toggleCommentLike(item.id)}
          >
            <AntDesign 
              name={item.hasLiked ? "heart" : "hearto"} 
              size={14} 
              color={item.hasLiked ? "#FF6B6B" : "#888"} 
            />
            <Text style={styles.commentActionText}>{formatCount(toCount(item.likes))}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.commentActionButton}
            onPress={() => setReplyingTo({ commentId: item.id, username: item.author_username || 'Anonymous' })}
          >
            <Text style={styles.commentActionText}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFooter = () => {
    if (!hasMore) return null;
    
    return (
      <View style={styles.loadMoreContainer}>
        {loadingMore ? (
          <ActivityIndicator size="small" color="#00BFFF" />
        ) : (
          <TouchableOpacity onPress={handleLoadMore} style={styles.loadMoreButton}>
            <Text style={styles.loadMoreText}>Load more comments</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (!visible) return null;

  // Use display_count from summary for exact count
  const displayCount = commentSummary.display_count;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.backdropContainer}>
        {/* Dimmed backdrop behind the sheet */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Touch shield for the top 28% visible video area */}
        <Pressable
          style={styles.topShield}
          onPress={onClose}
          pointerEvents="auto"
        />

        {/* The bottom sheet itself (72% height) */}
        <Animated.View
          style={[styles.sheet, { height: snapHeight, transform: [{ translateY }] }]}
          {...pan.panHandlers}
        >
          <SafeAreaView style={styles.safeArea} pointerEvents="auto">
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.grabber} />
              <Text style={styles.headerTitle}>Comments {formatCount(displayCount)}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Comments List - flex: 1 to take available space */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00BFFF" />
                <Text style={styles.loadingText}>Loading comments...</Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={comments}
                renderItem={renderComment}
                keyExtractor={(item) => item.id}
                style={styles.commentsList}
                contentContainerStyle={{ 
                  paddingHorizontal: 16,
                  paddingTop: 8,
                  paddingBottom: 64 + insets.bottom, // space behind the input bar
                }}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode={Platform.select({ ios: 'interactive', android: 'on-drag' })}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.noCommentsText}>No comments yet. Be the first to comment!</Text>
                }
                ListFooterComponent={renderFooter}
              />
            )}

            {/* Comments Input Bar - absolutely positioned and animated with keyboard */}
            <Animated.View
              style={[
                styles.inputBarContainer,
                {
                  paddingBottom: insets.bottom,
                  transform: [{ translateY: Animated.multiply(keyboardInsetAnim, -1) }],
                },
              ]}
              pointerEvents="auto"
            >
              {currentUserId ? (
                <CommentInputBar
                  onSend={handleSend}
                  pending={pendingSend}
                  replyingTo={replyingTo}
                  onCancelReply={() => setReplyingTo(null)}
                />
              ) : (
                <View style={styles.loginPrompt}>
                  <Text style={styles.loginPromptText}>Please log in to comment</Text>
                </View>
              )}
            </Animated.View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropContainer: { 
    flex: 1, 
    justifyContent: 'flex-end' 
  },
  backdrop: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(0,0,0,0.5)' 
  },
  topShield: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: Math.round(height * 0.3) 
  },
  sheet: {
    backgroundColor: '#101012',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  grabber: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 4,
    backgroundColor: '#FFF',
    opacity: 0.5,
    borderRadius: 2,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginTop: 8,
  },
  closeButton: {
    padding: 4,
    marginTop: 8,
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
    flex: 1,
  },
  commentCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  replyCard: {
    marginLeft: 20,
    backgroundColor: '#2C2C2E',
    borderLeftWidth: 3,
    borderLeftColor: '#00BFFF',
  },
  replyIndicatorLine: {
    position: 'absolute',
    left: -20,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#00BFFF',
    opacity: 0.3,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  commentAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  commentMeta: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00BFFF',
  },
  commentTime: {
    fontSize: 12,
    color: '#888',
  },
  replyLabel: {
    fontSize: 11,
    color: '#00BFFF',
    fontStyle: 'italic',
    marginLeft: 4,
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
    marginRight: 16,
  },
  commentActionText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 4,
  },
  loadMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreButton: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  loadMoreText: {
    color: '#00BFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  noCommentsText: {
    color: '#B0B0B0',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  inputBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f0f12',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    zIndex: 10,
  },
  loginPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  loginPromptText: {
    color: '#888',
    fontSize: 14,
  },
});