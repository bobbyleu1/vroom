// TestIOSNotifications.js
// Simple test to verify iOS push notifications are working

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from './utils/supabase';

export default function TestIOSNotifications() {
  const [logs, setLogs] = useState([]);
  const [currentToken, setCurrentToken] = useState(null);
  const [permissions, setPermissions] = useState(null);

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setLogs(prev => [...prev, logEntry]);
  };

  // Check initial state on mount
  useEffect(() => {
    if (Platform.OS === 'ios') {
      checkInitialState();
    } else {
      addLog('⚠️ This test is designed for iOS');
    }
  }, []);

  const checkInitialState = async () => {
    addLog('=== iOS Push Notification Initial State ===');
    addLog(`Device: ${Device.deviceName} (${Device.osName} ${Device.osVersion})`);
    addLog(`Is Physical Device: ${Device.isDevice}`);
    
    // Check current permissions
    const { status } = await Notifications.getPermissionsAsync();
    setPermissions(status);
    addLog(`Current Permission Status: ${status}`);
  };

  const requestPermissions = async () => {
    addLog('=== Requesting iOS Notification Permissions ===');
    
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      addLog(`Existing status: ${existingStatus}`);
      
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowDisplayInCarPlay: true,
            allowCriticalAlerts: false,
            provideAppNotificationSettings: true,
            allowProvisional: false,
          },
        });
        finalStatus = status;
      }
      
      setPermissions(finalStatus);
      addLog(`Final Permission Status: ${finalStatus}`);
      
      if (finalStatus !== 'granted') {
        addLog('❌ Permission denied - notifications will not work!');
        Alert.alert(
          'Notifications Disabled', 
          'Please enable notifications in iOS Settings > Vroom > Notifications'
        );
        return false;
      } else {
        addLog('✅ Notification permissions granted!');
        return true;
      }
    } catch (error) {
      addLog(`❌ Error requesting permissions: ${error.message}`);
      return false;
    }
  };

  const getExpoPushToken = async () => {
    addLog('=== Getting Expo Push Token ===');
    
    try {
      if (!Device.isDevice) {
        addLog('❌ Must use physical device for push notifications');
        return;
      }

      // First ensure we have permissions
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        return;
      }

      addLog('Requesting Expo push token...');
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: '49513f8d-d50b-4469-b988-bf9caf4409ae',
      });
      
      setCurrentToken(token.data);
      addLog(`✅ Expo Push Token received: ${token.data.substring(0, 50)}...`);
      
      return token.data;
    } catch (error) {
      addLog(`❌ Error getting push token: ${error.message}`);
      if (error.code) {
        addLog(`Error Code: ${error.code}`);
      }
      return null;
    }
  };

  const saveTokenToDatabase = async () => {
    if (!currentToken) {
      addLog('❌ No token to save - get token first');
      return;
    }

    addLog('=== Saving Token to Database ===');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addLog('❌ No authenticated user');
        return;
      }

      addLog(`Saving token for user: ${user.id}`);
      
      const { error } = await supabase
        .from('profiles')
        .update({ push_token: currentToken })
        .eq('id', user.id);

      if (error) {
        addLog(`❌ Database error: ${error.message}`);
      } else {
        addLog('✅ Token saved successfully!');
      }
    } catch (error) {
      addLog(`❌ Exception: ${error.message}`);
    }
  };

  const sendTestNotification = async () => {
    if (!currentToken) {
      addLog('❌ No token available - get token first');
      return;
    }

    addLog('=== Sending Test Push Notification ===');
    
    try {
      const message = {
        to: currentToken,
        sound: 'default',
        title: 'iOS Test Notification 📱',
        body: 'This is a test from your Vroom app!',
        data: { 
          type: 'test',
          timestamp: new Date().toISOString()
        },
      };

      addLog('Sending to Expo push service...');
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();
      addLog(`Response: ${JSON.stringify(result, null, 2)}`);
      
      if (result.data?.[0]?.status === 'ok') {
        addLog('✅ Test notification sent successfully!');
        addLog('Check your device for the notification');
      } else {
        addLog(`❌ Notification failed: ${result.data?.[0]?.message || 'Unknown error'}`);
      }
    } catch (error) {
      addLog(`❌ Error sending notification: ${error.message}`);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>iOS Push Notification Test</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Permissions: <Text style={{color: permissions === 'granted' ? 'green' : 'red'}}>
            {permissions || 'Unknown'}
          </Text>
        </Text>
        <Text style={styles.statusText}>
          Token: {currentToken ? '✅' : '❌'}
        </Text>
      </View>

      <ScrollView style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={requestPermissions}>
          <Text style={styles.buttonText}>1. Request Permissions</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={getExpoPushToken}>
          <Text style={styles.buttonText}>2. Get Push Token</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={saveTokenToDatabase}>
          <Text style={styles.buttonText}>3. Save to Database</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={sendTestNotification}>
          <Text style={styles.buttonText}>4. Send Test Notification</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={clearLogs}>
          <Text style={styles.buttonText}>Clear Logs</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView style={styles.logContainer}>
        <Text style={styles.logTitle}>Test Logs:</Text>
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
    fontSize: 16,
    marginVertical: 2,
  },
  buttonContainer: {
    maxHeight: 250,
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
    fontSize: 11,
    marginBottom: 2,
  },
});