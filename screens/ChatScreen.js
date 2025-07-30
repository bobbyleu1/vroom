import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Alert,
} from 'react-native';
import { supabase } from '../utils/supabase';

const ChatScreen = ({ route }) => {
  const { conversationId, recipient } = route.params;
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const flatListRef = useRef(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (conversationId) fetchMessages();
  }, [conversationId]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch messages error:', error);
    } else {
      setMessages(data);
    }
  };

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel('realtime-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const sendMessage = async () => {
    if (!text.trim() || !userId) return;

    const { error } = await supabase.from('dm_messages').insert({
      conversation_id: conversationId,
      sender_id: userId,
      text: text.trim(),
    });

    if (error) {
      console.error('Send message error:', error);
      Alert.alert('Failed to send message', error.message);
    } else {
      setText('');
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  };

  const renderItem = ({ item }) => {
    const isMe = item.sender_id === userId;
    return (
      <View style={[styles.message, isMe ? styles.myMessage : styles.theirMessage]}>
        <Text style={styles.messageText}>{item.text}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.messagesWrapper}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <View style={styles.inputRow}>
          <TextInput
            placeholder="Message..."
            placeholderTextColor="#999"
            style={styles.input}
            value={text}
            onChangeText={setText}
          />
          <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  messagesWrapper: { padding: 12, paddingBottom: 100 },
  message: {
    maxWidth: '75%',
    marginVertical: 4,
    padding: 10,
    borderRadius: 10,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#00BFFF',
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#333',
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#111',
    borderTopColor: '#222',
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 16,
    marginRight: 10,
  },
  sendBtn: {
    backgroundColor: '#00BFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
});

export default ChatScreen;
