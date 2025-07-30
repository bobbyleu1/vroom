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

    if (!error) setResults(data);
  };

  const startConversation = async (otherUser) => {
    if (!userId || !otherUser?.id) return;

    const [id1, id2] = [userId, otherUser.id].sort(); // ensure ordering

    // Check if convo already exists
    const { data: existing } = await supabase
      .from('dm_conversations')
      .select('id')
      .eq('user1_id', id1)
      .eq('user2_id', id2)
      .maybeSingle();

    let conversationId = existing?.id;

    if (!conversationId) {
      // Create new conversation
      const { data, error } = await supabase
        .from('dm_conversations')
        .insert({
          user1_id: id1,
          user2_id: id2,
        })
        .select('id')
        .single();

      if (error) {
        Alert.alert('Error', 'Could not create conversation.');
        return;
      }

      conversationId = data.id;
    }

    navigation.navigate('ChatScreen', {
      conversationId,
      recipient: otherUser,
    });
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
              source={item.avatar_url ? { uri: item.avatar_url } : require('../assets/avatar_placeholder.png')}
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
