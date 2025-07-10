// screens/SearchScreen.js
import React, { useState } from 'react';
import { View, TextInput, FlatList, Text, TouchableOpacity } from 'react-native';
import { supabase } from '../utils/supabase';

const SearchScreen = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const searchUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${query}%`);
    if (!error) setResults(data);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000', padding: 10 }}>
      <TextInput
        placeholder='Search users...'
        placeholderTextColor='#555'
        style={{ backgroundColor: '#111', color: '#fff', padding: 10, borderRadius: 5, marginBottom: 10 }}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={searchUsers}
      />
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={{ padding: 10 }}>
            <Text style={{ color: '#3B82F6' }}>{item.username}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

export default SearchScreen;

