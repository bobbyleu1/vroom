import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../utils/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function AuthScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      console.log('Attempting to sign in with email:', email.trim().toLowerCase());
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email: email.trim().toLowerCase(), 
        password 
      });
      console.log('Sign in response:', { data, error });
      
      if (error) throw error;
      // Success - user will be automatically navigated by AuthContext
    } catch (error) {
      console.error('Auth error:', error);
      Alert.alert(
        'Login Failed', 
        error.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = () => {
    navigation.navigate('OnboardingWelcome');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logoText}>Vroom</Text>
          <Ionicons name="car-sport" size={32} color="#00BFFF" style={{ marginLeft: 6 }} />
        </View>

        {/* Mode Indicator */}
        <Text style={styles.modeText}>
          Welcome back
        </Text>

        {/* Email */}
        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color="#888" style={styles.icon} />
          <TextInput
            placeholder="Email"
            placeholderTextColor="#888"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        {/* Password */}
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.icon} />
          <TextInput
            placeholder="Password"
            placeholderTextColor="#888"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* Login Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Logging in...' : 'Log In'}
          </Text>
        </TouchableOpacity>

        {/* Sign Up Section */}
        <View style={styles.signUpContainer}>
          <Text style={styles.signUpPrompt}>
            Don't have an account?
          </Text>
          <TouchableOpacity 
            style={styles.signUpButton}
            onPress={handleSignUp}
          >
            <Text style={styles.signUpButtonText}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footerText}>Powered by <Text style={{ color: '#888' }}>Vroom</Text></Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0c10', // soft black
  },
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  logoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  modeText: {
    fontSize: 18,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 30,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 14,
  },
  button: {
    backgroundColor: '#00BFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  signUpContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  signUpPrompt: {
    color: '#888',
    fontSize: 16,
    marginBottom: 16,
  },
  signUpButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#00BFFF',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  signUpButtonText: {
    color: '#00BFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerText: {
    textAlign: 'center',
    color: '#444',
    fontSize: 14,
    position: 'absolute',
    bottom: 20,
    width: '100%',
  },
});
