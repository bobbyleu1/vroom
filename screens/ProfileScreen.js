import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  FlatList,
  Modal,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '../utils/supabase';
import { useNavigation } from '@react-navigation/native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPostIndex, setSelectedPostIndex] = useState(null);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const { data: userPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });

      const { count: followersCount } = await supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

      const { count: followingCount } = await supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

      setProfile(userProfile);
      setPosts(userPosts || []);
      setFollowers(followersCount || 0);
      setFollowing(followingCount || 0);
      setLoading(false);
    };

    fetchProfile();
  }, []);

  const renderPost = ({ item, index }) => (
    <TouchableOpacity
      onPress={() => setSelectedPostIndex(index)}
      style={styles.postTile}
    >
      {item.file_type === 'image' ? (
        <Image source={{ uri: item.media_url }} style={styles.postImage} />
      ) : (
        <Video
          source={{ uri: item.media_url }}
          style={styles.postImage}
          resizeMode="cover"
          shouldPlay={false}
          isLooping
        />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.header}>
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          <Text style={styles.username}>@{profile.username || 'Unnamed'}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{posts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{followers}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{following}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          numColumns={3}
          scrollEnabled={false}
          contentContainerStyle={styles.grid}
        />
      </ScrollView>

      <Modal visible={selectedPostIndex !== null} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalClose}
          onPress={() => setSelectedPostIndex(null)}
        >
          <Ionicons name="close" size={32} color="#fff" />
        </TouchableOpacity>
        {selectedPostIndex !== null && (
          <Video
            source={{ uri: posts[selectedPostIndex].media_url }}
            style={styles.fullscreenMedia}
            resizeMode="contain"
            shouldPlay
            useNativeControls
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderColor: '#00BFFF',
    borderWidth: 2,
  },
  username: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 15,
  },
  statBox: {
    alignItems: 'center',
    marginHorizontal: 15,
  },
  statNumber: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  editBtn: {
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  editBtnText: {
    color: '#fff',
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  postTile: {
    width: width / 3,
    aspectRatio: 1,
    borderWidth: 0.5,
    borderColor: '#111',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  modalClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    right: 20,
    zIndex: 10,
  },
  fullscreenMedia: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
});
