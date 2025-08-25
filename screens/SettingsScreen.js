import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView, 
  Platform, 
  Switch,
  ScrollView,
  Alert,
  Linking 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';

const SettingsScreen = ({ navigation }) => {
  const { signOut } = useAuth();
  
  // Settings state with persistent storage
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [saveToPhotos, setSaveToPhotos] = useState(false);
  const [highQuality, setHighQuality] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [loading, setLoading] = useState(true);

  // Load settings from storage on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.multiGet([
        'settings_notifications',
        'settings_darkMode',
        'settings_autoplay',
        'settings_saveToPhotos',
        'settings_highQuality',
        'settings_analytics',
      ]);

      savedSettings.forEach(([key, value]) => {
        if (value !== null) {
          const boolValue = value === 'true';
          switch (key) {
            case 'settings_notifications':
              setNotifications(boolValue);
              break;
            case 'settings_darkMode':
              setDarkMode(boolValue);
              break;
            case 'settings_autoplay':
              setAutoplay(boolValue);
              break;
            case 'settings_saveToPhotos':
              setSaveToPhotos(boolValue);
              break;
            case 'settings_highQuality':
              setHighQuality(boolValue);
              break;
            case 'settings_analytics':
              setAnalytics(boolValue);
              break;
          }
        }
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (key, value) => {
    try {
      await AsyncStorage.setItem(`settings_${key}`, value.toString());
    } catch (error) {
      console.error('Error saving setting:', error);
    }
  };

  // Setting handlers with persistence
  const handleNotificationsToggle = (value) => {
    setNotifications(value);
    saveSetting('notifications', value);
  };

  const handleDarkModeToggle = (value) => {
    setDarkMode(value);
    saveSetting('darkMode', value);
    // Dark mode is always enabled in this app
    Alert.alert('Dark Mode', 'Dark mode is optimized for the best viewing experience and cannot be disabled.');
    setDarkMode(true); // Keep it always true
  };

  const handleAutoplayToggle = (value) => {
    setAutoplay(value);
    saveSetting('autoplay', value);
  };

  const handleSaveToPhotosToggle = (value) => {
    setSaveToPhotos(value);
    saveSetting('saveToPhotos', value);
  };

  const handleHighQualityToggle = (value) => {
    setHighQuality(value);
    saveSetting('highQuality', value);
  };

  const handleAnalyticsToggle = (value) => {
    setAnalytics(value);
    saveSetting('analytics', value);
  };

  // Navigation and action handlers
  const handleEditProfile = () => {
    // Check if EditProfileScreen exists, otherwise navigate to existing screen
    try {
      navigation.navigate('EditProfile');
    } catch (error) {
      // Fallback to a working screen or show alert
      Alert.alert(
        'Edit Profile',
        'Profile editing functionality coming soon! For now, you can update your profile from the profile tab.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      'To change your password, please sign out and use the "Forgot Password" option on the login screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
      ]
    );
  };

  const handlePrivacyPolicy = () => {
    Alert.alert(
      'Privacy Policy',
      'Opening privacy policy in your browser...',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open', 
          onPress: () => {
            // Replace with your actual privacy policy URL
            Linking.openURL('https://vroom-app.com/privacy-policy').catch(err => {
              Alert.alert('Error', 'Could not open privacy policy. Please try again later.');
            });
          }
        },
      ]
    );
  };

  const handleTermsOfService = () => {
    Alert.alert(
      'Terms of Service',
      'Opening terms of service in your browser...',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open', 
          onPress: () => {
            // Replace with your actual terms URL
            Linking.openURL('https://vroom-app.com/terms-of-service').catch(err => {
              Alert.alert('Error', 'Could not open terms of service. Please try again later.');
            });
          }
        },
      ]
    );
  };

  const handleHelpFAQ = () => {
    Alert.alert(
      'Help & FAQ',
      'Opening help center in your browser...',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open', 
          onPress: () => {
            // Replace with your actual help center URL
            Linking.openURL('https://vroom-app.com/help').catch(err => {
              Alert.alert('Error', 'Could not open help center. Please try again later.');
            });
          }
        },
      ]
    );
  };

  const handleContactUs = () => {
    Alert.alert(
      'Contact Us',
      'How would you like to contact us?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Email', 
          onPress: () => {
            Linking.openURL('mailto:support@vroom-app.com?subject=Vroom App Support').catch(err => {
              Alert.alert('Error', 'Could not open email app. Please try again later.');
            });
          }
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              // Navigation will be handled automatically by AuthContext
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ],
    );
  };

  const SettingItem = ({ icon, title, subtitle, value, onToggle, type = 'toggle' }) => (
    <View style={styles.settingItem}>
      <View style={styles.settingLeft}>
        <Ionicons name={icon} size={24} color="#00BFFF" style={styles.settingIcon} />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {type === 'toggle' && (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: '#3e3e3e', true: '#00BFFF' }}
          thumbColor={value ? '#ffffff' : '#f4f3f4'}
          ios_backgroundColor="#3e3e3e"
        />
      )}
      {type === 'arrow' && (
        <Ionicons name="chevron-forward" size={20} color="#888" />
      )}
    </View>
  );

  const SettingSection = ({ title, children }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {children}
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={styles.settingTitle}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#00BFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* General Settings */}
        <SettingSection title="General">
          <SettingItem
            icon="notifications-outline"
            title="Push Notifications"
            subtitle="Receive notifications for likes, comments, and follows"
            value={notifications}
            onToggle={handleNotificationsToggle}
          />
          <SettingItem
            icon="moon-outline"
            title="Dark Mode"
            subtitle="Always enabled for optimal viewing experience"
            value={darkMode}
            onToggle={handleDarkModeToggle}
          />
        </SettingSection>

        {/* Video Settings */}
        <SettingSection title="Video & Media">
          <SettingItem
            icon="play-circle-outline"
            title="Autoplay Videos"
            subtitle="Automatically play videos when scrolling"
            value={autoplay}
            onToggle={handleAutoplayToggle}
          />
          <SettingItem
            icon="download-outline"
            title="Save to Photos"
            subtitle="Allow saving videos to your photo library"
            value={saveToPhotos}
            onToggle={handleSaveToPhotosToggle}
          />
          <SettingItem
            icon="videocam-outline"
            title="High Quality Upload"
            subtitle="Upload videos in highest quality (uses more data)"
            value={highQuality}
            onToggle={handleHighQualityToggle}
          />
        </SettingSection>

        {/* Privacy Settings */}
        <SettingSection title="Privacy & Data">
          <SettingItem
            icon="analytics-outline"
            title="Analytics"
            subtitle="Help improve the app by sharing usage data"
            value={analytics}
            onToggle={handleAnalyticsToggle}
          />
          <TouchableOpacity style={styles.settingItem} onPress={handlePrivacyPolicy}>
            <View style={styles.settingLeft}>
              <Ionicons name="shield-outline" size={24} color="#00BFFF" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Privacy Policy</Text>
                <Text style={styles.settingSubtitle}>View our privacy policy and data usage</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={handleTermsOfService}>
            <View style={styles.settingLeft}>
              <Ionicons name="document-text-outline" size={24} color="#00BFFF" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Terms of Service</Text>
                <Text style={styles.settingSubtitle}>Read our terms and conditions</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
        </SettingSection>

        {/* Account Settings */}
        <SettingSection title="Account">
          <TouchableOpacity style={styles.settingItem} onPress={handleEditProfile}>
            <View style={styles.settingLeft}>
              <Ionicons name="person-outline" size={24} color="#00BFFF" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Edit Profile</Text>
                <Text style={styles.settingSubtitle}>Update your profile information</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={handleChangePassword}>
            <View style={styles.settingLeft}>
              <Ionicons name="key-outline" size={24} color="#00BFFF" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Change Password</Text>
                <Text style={styles.settingSubtitle}>Update your account password</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
        </SettingSection>

        {/* Support */}
        <SettingSection title="Support">
          <TouchableOpacity style={styles.settingItem} onPress={handleHelpFAQ}>
            <View style={styles.settingLeft}>
              <Ionicons name="help-circle-outline" size={24} color="#00BFFF" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Help & FAQ</Text>
                <Text style={styles.settingSubtitle}>Get help and find answers</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={handleContactUs}>
            <View style={styles.settingLeft}>
              <Ionicons name="mail-outline" size={24} color="#00BFFF" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Contact Us</Text>
                <Text style={styles.settingSubtitle}>Send feedback or report issues</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
        </SettingSection>

        {/* App Info */}
        <SettingSection title="About">
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="information-circle-outline" size={24} color="#00BFFF" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Version</Text>
                <Text style={styles.settingSubtitle}>1.0.0 (Beta)</Text>
              </View>
            </View>
          </View>
        </SettingSection>

        {/* Sign Out */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={[styles.settingItem, styles.signOutButton]}
            onPress={handleSignOut}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="log-out-outline" size={24} color="#FF4444" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: '#FF4444' }]}>Sign Out</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    paddingHorizontal: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    backgroundColor: '#111',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 16,
    width: 24,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFF',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#888',
    lineHeight: 18,
  },
  signOutButton: {
    borderBottomWidth: 0,
  },
});

export default SettingsScreen;