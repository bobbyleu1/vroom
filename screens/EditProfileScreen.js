import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, Alert, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../utils/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function EditProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session.user.id;
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) {
        Alert.alert('Error', error.message);
        setLoading(false);
        return;
      }
      setProfile(data);
      setUsername(data.username || '');
      setBio(data.bio || '');
      setLocation(data.location || '');
      setWebsite(data.website_link || '');
      setAvatar(data.avatar_url || null);
      setLoading(false);
    };
    fetchProfile();
  }, []);

  const handleChoosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setAvatar(uri);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session.user.id;
      let avatarUrl = profile.avatar_url;

      if (avatar && avatar !== profile.avatar_url) {
        const response = await fetch(avatar);
        const blob = await response.blob();
        const fileExt = avatar.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, blob, {
          cacheControl: '3600',
          upsert: true,
        });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        avatarUrl = data.publicUrl;
      }

      const updates = {
        username,
        bio,
        location,
        website_link: website,
        avatar_url: avatarUrl,
        updated_at: new Date(),
      };

      const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
      if (error) throw error;

      Alert.alert('Success', 'Profile updated!');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color="#00BFFF" style={{ flex: 1, backgroundColor: '#000' }} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#000' }} contentContainerStyle={{ alignItems: 'center', padding: 20 }}>
      {/* Close Button */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ position: 'absolute', top: 40, right: 20 }}>
        <Ionicons name="close" size={30} color="#fff" />
      </TouchableOpacity>

      {/* Profile Photo */}
      {avatar ? (
        <Image source={{ uri: avatar }} style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#00BFFF', marginTop: 60 }} />
      ) : (
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#333', marginTop: 60 }} />
      )}
      <TouchableOpacity onPress={handleChoosePhoto} style={{ backgroundColor: '#00BFFF', padding: 8, borderRadius: 6, marginTop: 10 }}>
        <Text style={{ color: '#fff' }}>Choose Photo</Text>
      </TouchableOpacity>

      {/* Username */}
      <TextInput
        style={styles.input}
        placeholder="Username"
        placeholderTextColor="#888"
        value={username}
        onChangeText={setUsername}
      />

      {/* Location */}
      <TextInput
        style={styles.input}
        placeholder="Location"
        placeholderTextColor="#888"
        value={location}
        onChangeText={setLocation}
      />

      {/* Bio */}
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Bio"
        placeholderTextColor="#888"
        value={bio}
        onChangeText={setBio}
        multiline
      />
      <Text style={{ color: '#555', alignSelf: 'flex-end', marginRight: 10 }}>{bio.length}/500</Text>

      {/* Website Link */}
      <TextInput
        style={styles.input}
        placeholder="Website/Social Link"
        placeholderTextColor="#888"
        value={website}
        onChangeText={setWebsite}
      />

      {/* Buttons */}
      <View style={{ flexDirection: 'row', marginTop: 20 }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.button, { backgroundColor: '#555', marginRight: 10 }]}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.button, { backgroundColor: '#00BFFF' }]}
        >
          <Text style={styles.buttonText}>Save Changes</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#222',
    color: '#fff',
    width: '100%',
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    width: 140,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});
