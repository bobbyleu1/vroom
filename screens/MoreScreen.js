import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

const MoreScreen = ({ navigation }) => { // Ensure 'navigation' prop is received
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
      </View>
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Groups')} // Navigates to GroupsScreen
        >
          <Ionicons name="people-circle-outline" size={30} color="#FFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Groups</Text>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Forums')} // <--- THIS IS THE KEY LINE
        >
          <Ionicons name="chatbubbles-outline" size={30} color="#FFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Forums</Text>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* Add more options here as needed */}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000', // Dark background
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, // Adjust for Android status bar
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
    color: '#FFF', // White text for header
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E', // Darker background for buttons
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 15,
    width: '100%',
    maxWidth: 400, // Max width for larger screens
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#00BFFF',
  },
  buttonIcon: {
    marginRight: 15,
  },
  buttonText: {
    flex: 1, // Allows text to take up remaining space
    fontSize: 18,
    fontWeight: '600',
    color: '#E0E0E0', // Light gray text
  },
});

export default MoreScreen;
