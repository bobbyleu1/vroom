// screens/MoreScreen.js (Updated to link to GroupsScreen)

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native'; // <-- NEW IMPORT!

const { width, height } = Dimensions.get('window');

function MoreScreen() {
  const navigation = useNavigation(); // <-- Get navigation object

  const handleOptionPress = (optionName) => {
    console.log(`${optionName} pressed!`);
    if (optionName === 'Groups') {
      navigation.navigate('Groups'); // Navigate to the 'Groups' stack screen
    }
    // You can add more navigation logic for 'Forums' etc. here later
  };

  const handleClose = () => {
    // For a tab screen, this button is primarily for visual fidelity to the example.
    // If this were a true modal, you'd use navigation.goBack() or similar here.
    console.log("Close button pressed (visual only for tab screen)");
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.modalContainer}>
        {/* Close Button (X) */}
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.title}>More Options</Text>

        {/* Options List */}
        <View style={styles.optionsList}>
          {/* Groups Option */}
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => handleOptionPress('Groups')}
          >
            <View style={styles.iconBackground}>
              <Ionicons name="people-outline" size={24} color="#00BFFF" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.optionTitle}>Groups</Text>
              <Text style={styles.optionDescription}>Join car enthusiast communities</Text>
            </View>
          </TouchableOpacity>

          {/* Forums Option */}
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => handleOptionPress('Forums')}
          >
            <View style={styles.iconBackground}>
              <Ionicons name="chatbubbles-outline" size={24} color="#00BFFF" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.optionTitle}>Forums</Text>
              <Text style={styles.optionDescription}>Discuss topics and get advice</Text>
            </View>
          </TouchableOpacity>

          {/* Add more options here later if needed */}

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1C1C1E',
    width: '100%',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    minHeight: height * 0.4,
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
    padding: 5,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  optionsList: {
    width: '100%',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  iconBackground: {
    backgroundColor: '#3A3A3C',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  optionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionDescription: {
    color: '#B0B0B0',
    fontSize: 13,
  },
});

export default MoreScreen;