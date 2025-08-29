// screens/ChatScreen.js

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Alert,
  Animated,
} from 'react-native';
import { supabase } from '../utils/supabase';
import { notifyDirectMessage } from '../utils/notificationHelpers';
import { useUnreadMessages } from '../contexts/UnreadMessagesContext';
import { useKeyboardInset } from '../src/ui/useKeyboardInset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Helper to format timestamps into relative time strings
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

const ChatScreen = ({ route, navigation }) => {
  // Memoize route params to prevent unnecessary re-renders
  const routeParams = useMemo(() => route.params, [route.params?.conversationId, route.params?.recipient?.id]);
  const { conversationId, recipient } = routeParams;
  
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);
  const insets = useSafeAreaInsets();
  const { keyboardInsetAnim } = useKeyboardInset();
  
  // Hook for updating unread message count
  const { markConversationAsRead } = useUnreadMessages();
  
  // Only log once per conversation
  const hasLoggedParamsRef = useRef(null);
  useEffect(() => {
    if (conversationId && conversationId !== hasLoggedParamsRef.current) {
      console.log('ChatScreen loaded for conversation:', conversationId);
      hasLoggedParamsRef.current = conversationId;
    }
  }, [conversationId]);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (conversationId && userId) {
      fetchMessages();
    }
  }, [conversationId, userId]);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    
    console.log('Fetching messages for conversation:', conversationId);
    setLoading(true);
    try {
      // Use the new paginated function
      const { data, error } = await supabase.rpc('get_dm_messages', {
        conversation_uuid: conversationId,
        page_size: 50,
        before_message_id: null
      });
      
      console.log('Fetch messages result:', { data, error });
      
      if (error) {
        console.error('Fetch messages error:', error);
      } else {
        console.log('Setting messages:', data?.length || 0, 'messages');
        // Reverse the messages so oldest appears first (normal chat order)
        const sortedMessages = (data || []).reverse();
        setMessages(sortedMessages);
        // Mark messages as read when opening conversation
        if (userId) {
          markAsRead();
        }
        // Ensure we scroll to bottom after loading messages
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 200);
      }
    } catch (error) {
      console.error('Exception fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, userId]);

  const markAsRead = async () => {
    try {
      await supabase.rpc('mark_dm_messages_as_read', {
        conversation_uuid: conversationId,
        reader_uuid: userId
      });
      
      // Update the global unread count
      await markConversationAsRead(conversationId);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  useEffect(() => {
    if (!conversationId || !userId) return;
    
    console.log('Setting up realtime subscription for conversation:', conversationId);
    
    console.log('Setting up realtime subscription with filter:', `conversation_id=eq.${conversationId}`);
    
    const channel = supabase
      .channel(`realtime-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('Realtime message received:', payload);
          
          // Create a properly formatted message object
          const newMessage = {
            id: payload.new.id,
            conversation_id: payload.new.conversation_id,
            sender_id: payload.new.sender_id,
            text: payload.new.text,
            created_at: payload.new.created_at,
            is_read: payload.new.is_read
          };
          
          setMessages((prev) => {
            // Avoid duplicates
            const messageExists = prev.some(msg => msg.id === newMessage.id);
            if (messageExists) {
              console.log('Message already exists in state, skipping duplicate');
              return prev;
            }
            
            console.log('Adding realtime message to state:', newMessage);
            // Add new message at the end (bottom) - normal chat behavior
            return [...prev, newMessage];
          });
          
          // Auto-mark as read if message is from other user
          if (payload.new.sender_id !== userId) {
            console.log('Message from other user, marking as read');
            setTimeout(() => markAsRead(), 500);
          }
          
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        },
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime subscription is now active and listening for new messages');
        }
      });
      
    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  const sendMessage = async () => {
    if (!text.trim() || !userId || sending) return;
    
    console.log('Attempting to send message with conversationId:', conversationId);
    
    setSending(true);
    const messageText = text.trim();
    setText(''); // Clear input immediately for better UX
    
    try {
      const insertData = {
        conversation_id: conversationId,
        sender_id: userId,
        text: messageText,
        is_read: false
      };
      
      console.log('Inserting message with data:', insertData);
      
      const { data, error } = await supabase.from('dm_messages').insert(insertData).select('*').single();
      
      if (error) {
        console.error('Send message error:', error);
        Alert.alert('Failed to send message', error.message);
        setText(messageText); // Restore text on error
      } else {
        console.log('Message inserted successfully:', data);
        
        // Immediately add the message to the UI
        const newMessage = {
          id: data.id,
          conversation_id: data.conversation_id,
          sender_id: data.sender_id,
          text: data.text,
          created_at: data.created_at,
          is_read: data.is_read
        };
        
        setMessages((prev) => {
          // Avoid duplicates
          const messageExists = prev.some(msg => msg.id === newMessage.id);
          if (messageExists) return prev;
          
          console.log('Adding sent message to UI:', newMessage);
          // Add sent message at the end (bottom) - normal chat behavior
          return [...prev, newMessage];
        });
        
        // Get recipient ID from conversation
        const recipientId = recipient?.id;
        if (recipientId) {
          // Send push notification
          await notifyDirectMessage(conversationId, userId, recipientId, messageText);
        }
        
        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Exception sending message:', error);
      Alert.alert('Error', 'Failed to send message');
      setText(messageText); // Restore text on error
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }) => {
    const isMe = item.sender_id === userId;
    return (
      <View
        style={[styles.messageContainer, isMe ? styles.myContainer : styles.theirContainer]}
      >
        <View style={[styles.message, isMe ? styles.myMessage : styles.theirMessage]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <Text style={styles.messageTime}>{formatTimeAgo(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>@{recipient?.username || 'Chat'}</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Header */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>@{recipient?.username || 'Chat'}</Text>
          <View style={styles.placeholder} />
        </View>
      </SafeAreaView>
      
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.messagesWrapper, { paddingBottom: 64 + insets.bottom }]}
        onContentSizeChange={() => {
          // Always scroll to end when content changes
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }}
        onLayout={() => {
          // Scroll to end on initial layout
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }, 100);
        }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode={Platform.select({ ios: 'interactive', android: 'on-drag' })}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 10,
        }}
      />
      
      <Animated.View
        style={[
          styles.composer,
          {
            paddingBottom: insets.bottom,
            transform: [{ translateY: Animated.multiply(keyboardInsetAnim, -1) }],
          },
        ]}
      >
        <TextInput
          placeholder="Message..."
          placeholderTextColor="#999"
          style={styles.input}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          blurOnSubmit={false}
          returnKeyType="send"
          onSubmitEditing={sendMessage}
          maxLength={500}
        />
        <TouchableOpacity 
          onPress={sendMessage} 
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          disabled={!text.trim() || sending}
        >
          <Text style={styles.sendText}>{sending ? 'Sending...' : 'Send'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerSafeArea: { backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#000',
  },
  backButton: {
    padding: 5,
  },
  backText: {
    color: '#00BFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 34,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    fontSize: 16,
  },
  messagesWrapper: { 
    padding: 12,
    paddingTop: 8,
    flexGrow: 1,
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  myContainer: {
    justifyContent: 'flex-end',
  },
  theirContainer: {
    justifyContent: 'flex-start',
  },
  message: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  myMessage: {
    backgroundColor: '#00BFFF',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    backgroundColor: '#333',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 52,
    paddingHorizontal: 12,
    backgroundColor: '#0f0f12',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 16,
    marginRight: 10,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#00BFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#333',
  },
  sendText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default React.memo(ChatScreen);