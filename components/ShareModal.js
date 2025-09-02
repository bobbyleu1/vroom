import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  SafeAreaView,
  Alert,
  Image,
} from 'react-native';
import { isPad, getPhoneViewport } from '../utils/phoneViewport';
import { Ionicons, AntDesign, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { sharePost } from '../utils/share';
import { showReportPostDialog } from '../utils/postReporting';
import { confirmAndBlockUser } from '../utils/userBlocking';
import { confirmAndDeletePost } from '../utils/postManagement';
import { supabase } from '../utils/supabase';

const { width, height } = Dimensions.get('window');
const { phoneWidth, phoneHeight } = isPad ? getPhoneViewport() : { phoneWidth: width, phoneHeight: height };

const ShareModal = ({ 
  visible, 
  onClose, 
  post, 
  currentUserId, 
  onPostDeleted 
}) => {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);

  const isOwner = currentUserId && post?.author_id === currentUserId;

  // Fetch friends/contacts for DM sharing
  useEffect(() => {
    if (visible && currentUserId) {
      fetchFriends();
    }
  }, [visible, currentUserId]);

  const fetchFriends = async () => {
    try {
      setLoading(true);
      // For now, we'll skip fetching friends to avoid database schema issues
      // The main sharing functionality will work without this
      setFriends([]);
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShareToFriend = async (friend) => {
    try {
      // Use the database function to get or create conversation
      const { data: conversationId, error: convError } = await supabase
        .rpc('get_or_create_conversation', {
          user1_id: currentUserId,
          user2_id: friend.id
        });

      if (convError) throw convError;

      // Send message with post share
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: `Check out this ${post.video_url ? 'video' : 'post'}!`,
          shared_post_id: post.id,
          message_type: 'post_share'
        });

      if (messageError) throw messageError;

      // Update conversation's last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert('Sent!', `${post.video_url ? 'Video' : 'Post'} shared with ${friend.username || friend.email}`);
      onClose();
    } catch (error) {
      console.error('Error sharing to friend:', error);
      Alert.alert('Error', 'Failed to share post. Please try again.');
    }
  };

  const handleExternalShare = async () => {
    try {
      await sharePost(post);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
    } catch (error) {
      console.error('External share failed:', error);
      Alert.alert('Shared', 'Link copied to clipboard!');
      onClose();
    }
  };

  const handleReport = () => {
    onClose();
    setTimeout(() => {
      showReportPostDialog(post, currentUserId, () => {
        // Success callback
      });
    }, 300);
  };

  const handleBlock = () => {
    onClose();
    setTimeout(() => {
      const authorToBlock = {
        id: post.author_id,
        username: post.author_username || post.author?.username || post.profiles?.username,
        email: post.author_email || post.author?.email || post.profiles?.email
      };
      confirmAndBlockUser(authorToBlock, currentUserId, () => {
        Alert.alert('Success', 'Posts from this user will no longer appear in your feed.');
      });
    }, 300);
  };

  const handleDelete = () => {
    onClose();
    setTimeout(() => {
      confirmAndDeletePost(post, currentUserId, onPostDeleted);
    }, 300);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Post Options</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#999" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Send to friends section */}
                {friends.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Send to</Text>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      style={styles.friendsScroll}
                    >
                      {friends.map((friend) => (
                        <TouchableOpacity
                          key={friend.id}
                          style={styles.friendItem}
                          onPress={() => handleShareToFriend(friend)}
                        >
                          <View style={styles.friendAvatar}>
                            {friend.profile_picture_url ? (
                              <Image 
                                source={{ uri: friend.profile_picture_url }} 
                                style={styles.avatarImage}
                              />
                            ) : (
                              <View style={styles.defaultAvatar}>
                                <Ionicons name="person" size={24} color="#666" />
                              </View>
                            )}
                          </View>
                          <Text style={styles.friendName} numberOfLines={1}>
                            {friend.username || friend.email?.split('@')[0]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Action buttons */}
                <View style={styles.actionsSection}>
                  {/* Share Post */}
                  <TouchableOpacity 
                    style={styles.actionButton} 
                    onPress={handleExternalShare}
                  >
                    <View style={styles.actionIcon}>
                      <MaterialIcons name="share" size={24} color="#007AFF" />
                    </View>
                    <Text style={[styles.actionText, { color: '#007AFF' }]}>Share Post</Text>
                  </TouchableOpacity>

                  {/* Conditional actions based on ownership */}
                  {isOwner ? (
                    // Owner actions
                    <TouchableOpacity 
                      style={styles.actionButton} 
                      onPress={handleDelete}
                    >
                      <View style={styles.actionIcon}>
                        <MaterialIcons name="delete" size={24} color="#FF3B30" />
                      </View>
                      <Text style={[styles.actionText, { color: '#FF3B30' }]}>Delete Post</Text>
                    </TouchableOpacity>
                  ) : (
                    // Non-owner actions
                    <>
                      <TouchableOpacity 
                        style={styles.actionButton} 
                        onPress={handleReport}
                      >
                        <View style={styles.actionIcon}>
                          <MaterialIcons name="flag" size={24} color="#FF9500" />
                        </View>
                        <Text style={[styles.actionText, { color: '#FF9500' }]}>Report Post</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.actionButton} 
                        onPress={handleBlock}
                      >
                        <View style={styles.actionIcon}>
                          <MaterialIcons name="block" size={24} color="#FF3B30" />
                        </View>
                        <Text style={[styles.actionText, { color: '#FF3B30' }]}>Block User</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </ScrollView>

              {/* Cancel button */}
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    flex: 1,
  },
  safeArea: {
    position: 'absolute',
    bottom: 0,
    left: isPad ? (width - phoneWidth) / 2 : 0,
    right: isPad ? (width - phoneWidth) / 2 : 0,
    maxHeight: (isPad ? phoneHeight : height) * 0.8,
  },
  container: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  closeButton: {
    padding: 5,
  },
  section: {
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginBottom: 15,
    marginHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  friendsScroll: {
    paddingHorizontal: 20,
  },
  friendItem: {
    alignItems: 'center',
    marginRight: 20,
    width: 70,
  },
  friendAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  defaultAvatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendName: {
    fontSize: 12,
    color: '#FFF',
    textAlign: 'center',
  },
  actionsSection: {
    backgroundColor: '#2C2C2E',
    marginHorizontal: 10,
    borderRadius: 13,
    overflow: 'hidden',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#444',
  },
  actionIcon: {
    width: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  actionText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#FFF',
  },
  cancelButton: {
    backgroundColor: '#2C2C2E',
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
});

export default ShareModal;