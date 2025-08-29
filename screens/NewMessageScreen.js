import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../utils/supabase';

const NewMessageScreen = ({ navigation }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    fetchUser();
  }, []);

  const searchUsers = async (text) => {
    setSearch(text);
    if (text.length < 2) return setResults([]);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${text}%`)
      .neq('id', userId) // exclude self
      .limit(50)

    if (!error) setResults(data);
  };

  const startConversation = async (otherUser) => {
    if (!userId || !otherUser?.id) return;

    try {
      // Use the new database function to get or create conversation
      const { data, error } = await supabase.rpc('get_or_create_dm_conversation', {
        user1_uuid: userId,
        user2_uuid: otherUser.id
      });

      if (error) {
        console.error('Error creating conversation:', error);
        Alert.alert('Error', 'Could not create conversation.');
        return;
      }

      const conversationId = data;

      navigation.navigate('ChatScreen', {
        conversationId,
        recipient: otherUser,
      });
    } catch (error) {
      console.error('Exception starting conversation:', error);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.searchWrapper}>
        <TextInput
          placeholder="Search users..."
          placeholderTextColor="#999"
          style={styles.searchInput}
          value={search}
          onChangeText={searchUsers}
        />
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.userItem}
            onPress={() => startConversation(item)}
          >
            <Image
              source={item.avatar_url ? { uri: item.avatar_url } : { uri: 'https://via.placeholder.com/44' }}
              style={styles.avatar}
            />
            <Text style={styles.username}>@{item.username}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Start typing to find users</Text>
        }
        contentContainerStyle={{ padding: 20 }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  searchWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#111',
  },
  searchInput: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#333',
  },
  username: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 40,
  },
});

export default NewMessageScreen;
