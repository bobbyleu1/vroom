// screens/LoginScreen.js

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { supabase } from '../utils/supabase'; // Important: Adjust path if your utils folder is elsewhere

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (isSignUp) => {
    setLoading(true);
    try {
      const { error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Using Alert for feedback, consider a more native UI component in a real app
      Alert.alert('Success', isSignUp ? 'Check your email to confirm signup' : 'Logged in');
    } catch (error) {
      // Using Alert for error display
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vroom 🚗</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        value={email}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        onChangeText={setPassword}
        value={password}
      />
      <TouchableOpacity style={styles.button} onPress={() => handleAuth(false)} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Log In'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => handleAuth(true)} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Sign Up'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Styles specific to the LoginScreen
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  title: {
    fontSize: 28,
    color: '#fff',
    marginBottom: 20
  },
  input: {
    backgroundColor: '#222',
    color: '#fff',
    width: '100%',
    padding: 12,
    borderRadius: 8,
    marginVertical: 6
  },
  button: {
    backgroundColor: '#00BFFF',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontSize: 16
  },
});

export default LoginScreen;