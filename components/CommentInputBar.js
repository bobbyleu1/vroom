import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

export function CommentInputBar({
  onSend, 
  pending = false,
  replyingTo = null,
  onCancelReply = null,
}) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  // Auto-focus and prefill @mention when starting a reply
  useEffect(() => {
    if (replyingTo) {
      const mentionText = `@${replyingTo.username} `;
      setText(mentionText);
      // Auto-focus the input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [replyingTo]);

  const canSend = text.trim().length > 0 && !pending;

  const handleSubmit = async () => {
    console.log('🚀 CommentInputBar handleSubmit called, canSend:', canSend, 'text:', text.trim());
    if (!canSend) return;
    
    const payload = text.trim();
    setText('');
    
    try {
      await onSend(payload);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Keep focus for rapid replies:
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      console.error('Error sending comment:', error);
      // If failed, restore text so user doesn't lose it
      setText(payload);
    }
  };

  return (
    <View style={styles.container}>
      {replyingTo && (
        <View style={styles.replyIndicator}>
          <Text style={styles.replyText}>Replying to @{replyingTo.username}</Text>
          <TouchableOpacity onPress={onCancelReply} style={styles.cancelReply}>
            <Text style={styles.cancelText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={(newText) => {
            console.log('📝 CommentInputBar text changed:', newText);
            setText(newText);
          }}
          placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Add a comment..."}
          placeholderTextColor="#84848a"
          style={styles.textInput}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSubmit}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          onPress={() => {
            console.log('🎯 Send button pressed in CommentInputBar');
            handleSubmit();
          }}
          disabled={!canSend}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[styles.sendButton, { opacity: canSend ? 1 : 0.4 }]}
        >
          <Text style={styles.sendButtonText}>{pending ? '...' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f0f12',
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 191, 255, 0.1)',
  },
  replyText: {
    color: '#00BFFF',
    fontSize: 14,
  },
  cancelReply: {
    padding: 4,
  },
  cancelText: {
    color: '#888',
    fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  textInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    marginRight: 12,
    maxHeight: 100,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sendButton: {
    backgroundColor: '#00BFFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
    minHeight: 40,
  },
  sendButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
});