import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { pickAndUploadToMux, uploadVideoToMux } from '../utils/uploadToMux';
import { supabase } from '../utils/supabase';
import * as Haptics from 'expo-haptics';

export default function MuxUploadExample({ postId, onUploadComplete }) {
  const [uploading, setUploading] = useState(false);

  const handlePickAndUpload = async () => {
    try {
      setUploading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!session || !user) {
        Alert.alert('Error', 'Please log in to upload videos');
        return;
      }

      console.log('Starting Mux upload for post:', postId);

      const result = await pickAndUploadToMux({
        supabaseUrl: 'https://rafyqmwbbagsdugwjaxx.supabase.co',
        accessToken: session.access_token,
        postId: postId,
        userId: user.id,
      });

      if (result.canceled) {
        console.log('Upload canceled by user');
        return;
      }

      // Update post status to indicate upload is processing
      await supabase
        .from('posts')
        .update({ 
          mux_status: 'processing',
          file_type: 'video' 
        })
        .eq('id', postId);

      console.log('✅ Video uploaded to Mux successfully!');
      Alert.alert(
        'Upload Complete', 
        'Your video is being processed by Mux. It will be available shortly.',
        [{ text: 'OK', style: 'default' }]
      );

      onUploadComplete?.();

    } catch (error) {
      console.error('Upload failed:', error);
      Alert.alert(
        'Upload Failed', 
        error.message || 'An error occurred while uploading your video',
        [{ text: 'OK', style: 'default' }]
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
        onPress={handlePickAndUpload}
        disabled={uploading}
      >
        <Text style={styles.uploadButtonText}>
          {uploading ? 'Uploading to Mux...' : 'Upload Video to Mux'}
        </Text>
      </TouchableOpacity>
      
      {uploading && (
        <Text style={styles.uploadingText}>
          Please wait, uploading video to Mux...
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  uploadButton: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  uploadButtonDisabled: {
    backgroundColor: '#999',
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});