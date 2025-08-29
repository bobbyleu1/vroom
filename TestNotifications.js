// TestNotifications.js
// Simple test script to debug notification issues

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { supabase } from './utils/supabase';
import { initializePushNotifications, registerForPushNotificationsAsync, savePushTokenToProfile } from './utils/notificationService';
import { createNotification, triggerPushNotification } from './utils/notificationHelpers';

export default function TestNotifications() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testPushTokenRegistration = async () => {
    setLoading(true);
    addLog('=== Testing Push Token Registration ===');
    
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        addLog(`✅ Token received: ${token.substring(0, 20)}...`);
        await savePushTokenToProfile(token);
        addLog('✅ Token saved to profile');
      } else {
        addLog('❌ No token received');
      }
    } catch (error) {
      addLog(`❌ Error: ${error.message}`);
    }
    
    setLoading(false);
  };

  const testCreateNotification = async () => {
    setLoading(true);
    addLog('=== Testing Notification Creation ===');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addLog('❌ No authenticated user');
        setLoading(false);
        return;
      }

      const result = await createNotification({
        userId: user.id,
        type: 'test',
        message: 'This is a test notification',
        senderId: user.id
      });

      if (result) {
        addLog(`✅ Notification created with ID: ${result.id}`);
      } else {
        addLog('❌ Failed to create notification');
      }
    } catch (error) {
      addLog(`❌ Error: ${error.message}`);
    }
    
    setLoading(false);
  };

  const testPushTokensInDatabase = async () => {
    setLoading(true);
    addLog('=== Testing Push Tokens in Database ===');
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, push_token')
        .not('push_token', 'is', null)
        .limit(5);

      if (error) {
        addLog(`❌ Database error: ${error.message}`);
      } else {
        addLog(`✅ Found ${data.length} profiles with push tokens`);
        data.forEach(profile => {
          addLog(`  - ${profile.username}: ${profile.push_token?.substring(0, 20)}...`);
        });
      }
    } catch (error) {
      addLog(`❌ Error: ${error.message}`);
    }
    
    setLoading(false);
  };

  const testEdgeFunction = async () => {
    setLoading(true);
    addLog('=== Testing Edge Function ===');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addLog('❌ No authenticated user');
        setLoading(false);
        return;
      }

      const result = await triggerPushNotification(
        user.id,
        'test',
        'Test push notification',
        'test-123'
      );

      if (result) {
        addLog('✅ Edge function called successfully');
        addLog(`Response: ${JSON.stringify(result)}`);
      } else {
        addLog('❌ Edge function failed');
      }
    } catch (error) {
      addLog(`❌ Error: ${error.message}`);
    }
    
    setLoading(false);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notification Test Screen</Text>
      
      <ScrollView style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.button} 
          onPress={testPushTokenRegistration}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Push Token Registration</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.button} 
          onPress={testPushTokensInDatabase}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Check Database for Push Tokens</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.button} 
          onPress={testCreateNotification}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Notification Creation</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.button} 
          onPress={testEdgeFunction}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Edge Function</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.clearButton]} 
          onPress={clearLogs}
        >
          <Text style={styles.buttonText}>Clear Logs</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView style={styles.logContainer}>
        <Text style={styles.logTitle}>Debug Logs:</Text>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
        {logs.length === 0 && (
          <Text style={styles.logText}>No logs yet. Run a test above.</Text>
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
    marginBottom: 20,
  },
  buttonContainer: {
    flex: 1,
    maxHeight: 300,
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