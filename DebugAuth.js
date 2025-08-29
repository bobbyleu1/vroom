// DebugAuth.js
// Debug component to test authentication state

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { supabase } from './utils/supabase';

export default function DebugAuth() {
  const [authState, setAuthState] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLog = (message) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    addLog('=== Checking Authentication State ===');
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      addLog(`Auth getUser result: ${user ? 'User found' : 'No user'}`);
      
      if (error) {
        addLog(`Auth error: ${error.message}`);
      }
      
      if (user) {
        addLog(`User ID: ${user.id}`);
        addLog(`User Email: ${user.email}`);
        setAuthState(user);
      } else {
        addLog('User is not authenticated');
        setAuthState(null);
      }

      // Also check the session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      addLog(`Session exists: ${session ? 'Yes' : 'No'}`);
      
      if (sessionError) {
        addLog(`Session error: ${sessionError.message}`);
      }

    } catch (error) {
      addLog(`Exception checking auth: ${error.message}`);
    }
  };

  const testPostDeletion = async () => {
    addLog('=== Testing Post Deletion Permission ===');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        addLog('❌ No authenticated user');
        return;
      }

      addLog(`Testing with user ID: ${user.id}`);

      // Find a post by this user
      const { data: userPosts, error: fetchError } = await supabase
        .from('posts')
        .select('id, author_id, content')
        .eq('author_id', user.id)
        .limit(1);

      if (fetchError) {
        addLog(`❌ Error fetching user posts: ${fetchError.message}`);
        return;
      }

      if (!userPosts || userPosts.length === 0) {
        addLog('ℹ️ No posts found by this user');
        return;
      }

      const post = userPosts[0];
      addLog(`Found post: ID=${post.id}, Content="${post.content?.substring(0, 30)}..."`);

      // Test if we can delete it (dry run - we won't actually delete)
      addLog('Testing delete permissions (not actually deleting)...');
      
      // Instead of deleting, let's test the ownership check
      const { data: ownershipTest, error: ownershipError } = await supabase
        .from('posts')
        .select('id, author_id')
        .eq('id', post.id)
        .eq('author_id', user.id)
        .single();

      if (ownershipError) {
        addLog(`❌ Ownership check failed: ${ownershipError.message}`);
      } else if (ownershipTest) {
        addLog(`✅ Ownership verified: User ${user.id} owns post ${post.id}`);
      } else {
        addLog('❌ Ownership check returned no data');
      }

    } catch (error) {
      addLog(`Exception in test: ${error.message}`);
    }
  };

  const testGroupDeletion = async () => {
    addLog('=== Testing Group Deletion Permission ===');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        addLog('❌ No authenticated user');
        return;
      }

      addLog(`Testing with user ID: ${user.id}`);

      // Find a group by this user
      const { data: userGroups, error: fetchError } = await supabase
        .from('groups')
        .select('id, creator_id, name')
        .eq('creator_id', user.id)
        .limit(1);

      if (fetchError) {
        addLog(`❌ Error fetching user groups: ${fetchError.message}`);
        return;
      }

      if (!userGroups || userGroups.length === 0) {
        addLog('ℹ️ No groups found created by this user');
        return;
      }

      const group = userGroups[0];
      addLog(`Found group: ID=${group.id}, Name="${group.name}"`);
      addLog(`✅ User ${user.id} is creator of group ${group.id}`);

    } catch (error) {
      addLog(`Exception in test: ${error.message}`);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Authentication Debug</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Auth Status: {authState ? '✅ Authenticated' : '❌ Not Authenticated'}
        </Text>
        {authState && (
          <>
            <Text style={styles.statusText}>User ID: {authState.id?.substring(0, 8)}...</Text>
            <Text style={styles.statusText}>Email: {authState.email}</Text>
          </>
        )}
      </View>

      <ScrollView style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={checkAuthState}>
          <Text style={styles.buttonText}>Check Auth State</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={testPostDeletion}>
          <Text style={styles.buttonText}>Test Post Deletion</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={testGroupDeletion}>
          <Text style={styles.buttonText}>Test Group Deletion</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={clearLogs}>
          <Text style={styles.buttonText}>Clear Logs</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView style={styles.logContainer}>
        <Text style={styles.logTitle}>Debug Logs:</Text>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
        {logs.length === 0 && (
          <Text style={styles.logText}>No logs yet. Run tests above.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  statusContainer: {
    backgroundColor: '#e0e0e0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 14,
    marginVertical: 2,
  },
  buttonContainer: {
    maxHeight: 200,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginVertical: 5,
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#000',
    padding: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  logTitle: {
    color: '#00FF00',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logText: {
    color: '#00FF00',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
});