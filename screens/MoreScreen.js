import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useUnreadMessages } from '../contexts/UnreadMessagesContext';
import RedDot, { RedDotPositions } from '../components/RedDot';

const MoreScreen = ({ navigation }) => {
  const { hasUnreadMessages, totalUnreadCount } = useUnreadMessages();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
      </View>
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Groups')}
        >
          <Ionicons name="people-circle-outline" size={30} color="#FFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Groups</Text>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Forums')}
        >
          <Ionicons name="chatbubbles-outline" size={30} color="#FFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Forums</Text>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={30} color="#FFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* 👇 NEW: Direct Messages button */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('MessagesScreen')}
        >
          <View style={styles.buttonIconContainer}>
            <Ionicons name="chatbubble-ellipses-outline" size={30} color="#FFF" style={styles.buttonIcon} />
            <RedDot 
              visible={hasUnreadMessages} 
              count={totalUnreadCount}
              showCount={totalUnreadCount > 0}
              style={RedDotPositions.iconBadge}
              size={8}
            />
          </View>
          <Text style={styles.buttonText}>Direct Messages</Text>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={30} color="#FFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Settings</Text>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 15,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#00BFFF',
  },
  buttonIconContainer: {
    position: 'relative',
    marginRight: 15,
  },
  buttonIcon: {
    // marginRight handled by buttonIconContainer
  },
  buttonText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#E0E0E0',
  },
});

export default MoreScreen;
