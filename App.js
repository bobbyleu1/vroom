// Polyfill for structuredClone if not supported
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

import 'react-native-get-random-values'; // <<< KEEP THIS AT THE VERY TOP

import React, { useRef, useEffect } from 'react';
import { lockPortraitIphoneOnly } from './utils/orientation';
import mobileAds from 'react-native-google-mobile-ads';
import { View, ActivityIndicator, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons, Feather, Entypo } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import CameraScreen from './screens/CameraScreen.js';
import PostPreviewScreen from './screens/PostPreviewScreen.js';
import EditProfileScreen from './screens/EditProfileScreen';
import ProfileScreen from './screens/ProfileScreen';
import AuthScreen from './screens/AuthScreen';
import OnboardingWelcomeScreen from './screens/OnboardingWelcomeScreen';
import OnboardingProfilePictureScreen from './screens/OnboardingProfilePictureScreen';
import SimpleFeedScreen from './screens/SimpleFeedScreen';
import FriendsScreen from './screens/FriendsScreen';
import MoreScreen from './screens/MoreScreen';
import GroupsScreen from './screens/GroupsScreen';
import GroupDetailScreen from './screens/GroupDetailScreen';
import ForumsScreen from './screens/ForumsScreen';
import ForumPostDetailScreen from './screens/ForumPostDetailScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import MessagesScreen from './screens/MessagesScreen';
import SettingsScreen from './screens/SettingsScreen';
import NewMessageScreen from './screens/NewMessageScreen';
import ChatScreen from './screens/ChatScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import UserPostsFeedScreen from './screens/UserPostsFeedScreen';
import SearchScreen from './screens/SearchScreen';
import FollowersListScreen from './screens/FollowersListScreen';
import FollowingListScreen from './screens/FollowingListScreen';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ScrollLockProvider } from './contexts/ScrollLockContext';
import { UnreadMessagesProvider, useUnreadMessages } from './contexts/UnreadMessagesContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { setupPushNotificationsWithFeedback } from './utils/enhancedNotificationService';
import { runNotificationDiagnostic, testNotificationFlow, simulateUserLike, simulateUserComment, simulateUserFollow } from './utils/notificationTester';
import ErrorBoundary from './components/ErrorBoundary';
import RedDot, { RedDotPositions } from './components/RedDot';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Custom More Tab Icon with red dot for unread messages
function MoreTabIcon({ color, size, focused }) {
  const { hasUnreadMessages } = useUnreadMessages();

  return (
    <View style={{ position: 'relative' }}>
      <Feather name="more-horizontal" size={size} color={color} />
      <RedDot 
        visible={hasUnreadMessages} 
        style={RedDotPositions.tabBadge}
        size={10}
      />
    </View>
  );
}

// Custom Feed Tab Button with double tap refresh
function FeedTabButton({ children, onPress, focused, accessibilityState }) {
  const lastTap = useRef(null);
  const DOUBLE_TAP_DELAY = 300;
  const refreshCallbacks = useRef([]);
  
  // Register refresh callback from FeedScreen
  const registerRefreshCallback = (callback) => {
    refreshCallbacks.current = [callback]; // Replace any existing callback
  };
  
  // Expose globally so FeedScreen can register
  React.useEffect(() => {
    global.registerFeedRefresh = registerRefreshCallback;
    return () => {
      delete global.registerFeedRefresh;
    };
  }, []);
  
  const handleTabPress = () => {
    const now = Date.now();
    
    if (lastTap.current && (now - lastTap.current) < DOUBLE_TAP_DELAY) {
      // Double tap detected - refresh feed
      console.log('Double tap detected on Feed tab - refreshing feed');
      if (refreshCallbacks.current.length > 0) {
        refreshCallbacks.current.forEach(callback => callback());
        console.log('Refresh callbacks executed:', refreshCallbacks.current.length);
      } else {
        console.log('No refresh callbacks registered');
      }
      lastTap.current = null;
    } else {
      // Single tap - normal navigation
      lastTap.current = now;
      setTimeout(() => {
        if (lastTap.current === now) {
          onPress();
          lastTap.current = null;
        }
      }, DOUBLE_TAP_DELAY);
    }
  };
  
  return (
    <TouchableOpacity 
      onPress={handleTabPress} 
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      accessibilityState={accessibilityState}
    >
      {children}
    </TouchableOpacity>
  );
}

function MainApp() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          height: 70,
          borderTopWidth: 0,
          paddingBottom: Platform.OS === 'ios' ? 15 : 5,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          marginTop: -5,
        },
        tabBarActiveTintColor: '#00BFFF',
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({ color, size, focused }) => {
          let iconName;
          let IconComponent = Ionicons;

          if (route.name === 'Feed') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Friends') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Camera') {
            return (
              <View style={styles.uploadButton}>
                <Entypo name="plus" size={32} color="#000" />
              </View>
            );
          } else if (route.name === 'More') {
            return <MoreTabIcon color={color} size={size} focused={focused} />;
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <IconComponent name={iconName} size={size} color={color} />;
        },
      })}
    >
      {/* ⚠️ Make sure there's NO text, whitespace, or logic here outside of <Screen />s */}
      <Tab.Screen 
        name="Feed" 
        component={SimpleFeedScreen}
        options={{
          tabBarButton: (props) => <FeedTabButton {...props} />
        }}
      />
      <Tab.Screen name="Friends" component={FriendsScreen} />
      <Tab.Screen 
        name="Camera" 
        component={CameraScreen}
        options={{
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen name="More" component={MoreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { session, loading } = useAuth();

  // Initialize push notifications for logged in users
  React.useEffect(() => {
    if (session?.user) {
      // Run in background - don't block UI
      setupPushNotificationsWithFeedback(false).catch(error => {
        console.error('Background push notification init failed:', error);
      });
    }
  }, [session?.user]);

  if (loading) {
    return (
      <View style={styles.loadingIndicator}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="MainApp" component={MainApp} />
            <Stack.Screen name="PostPreview" component={PostPreviewScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Groups" component={GroupsScreen} />
            <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
            <Stack.Screen name="Forums" component={ForumsScreen} />
            <Stack.Screen name="ForumPostDetail" component={ForumPostDetailScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="MessagesScreen" component={MessagesScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="NewMessageScreen" component={NewMessageScreen} />
            <Stack.Screen name="ChatScreen" component={ChatScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen
              name="UserProfile"
              component={UserProfileScreen}
              options={{
                headerShown: true,
                headerTitle: 'Profile',
                headerTintColor: '#fff',
                headerStyle: { backgroundColor: '#000' },
              }}
            />
            <Stack.Screen
              name="UserPostsFeed"
              component={UserPostsFeedScreen}
              options={{
                headerShown: false,
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="FollowersList"
              component={FollowersListScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="FollowingList"
              component={FollowingListScreen}
              options={{
                headerShown: false,
              }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcomeScreen} />
            <Stack.Screen name="OnboardingProfilePicture" component={OnboardingProfilePictureScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  // Lock orientation to portrait and enforce iPhone-only behavior
  useEffect(() => {
    lockPortraitIphoneOnly();
  }, []);

  // Global error handler for unhandled exceptions
  React.useEffect(() => {
    const handleError = (error, isFatal) => {
      console.error('Global error handler:', error, 'Fatal:', isFatal);
      
      // Don't crash the app for non-fatal errors
      if (!isFatal) {
        console.log('Non-fatal error handled gracefully');
        return true;
      }
    };

    // Set up global error handling (if available)
    if (global.ErrorUtils) {
      global.ErrorUtils.setGlobalHandler(handleError);
    }
  }, []);

  // Initialize AdMob
  React.useEffect(() => {
    console.log('[ADMOB DEBUG] Starting AdMob initialization...');
    mobileAds()
      .initialize()
      .then(adapterStatuses => {
        console.log('[ADMOB DEBUG] AdMob initialized successfully:', adapterStatuses);
        Object.entries(adapterStatuses).forEach(([key, status]) => {
          console.log(`[ADMOB DEBUG] Adapter ${key}: ${status.state} - ${status.description}`);
        });
      })
      .catch(error => {
        console.error('[ADMOB DEBUG] AdMob initialization failed:', {
          message: error.message,
          code: error.code,
          stack: error.stack
        });
      });
  }, []);

  // Add notification diagnostic tools to global scope for easy testing
  React.useEffect(() => {
    if (__DEV__) {
      global.testNotifications = {
        runDiagnostic: runNotificationDiagnostic,
        testFlow: testNotificationFlow,
        simulateLike: simulateUserLike,
        simulateComment: simulateUserComment,
        simulateFollow: simulateUserFollow,
      };
      
      console.log('🧪 Notification testing tools available:');
      console.log('🧪 global.testNotifications.runDiagnostic() - Full system diagnostic');
      console.log('🧪 global.testNotifications.testFlow() - Test basic notification');
      console.log('🧪 global.testNotifications.simulateLike() - Simulate like notification');
      console.log('🧪 global.testNotifications.simulateComment() - Simulate comment notification');
      console.log('🧪 global.testNotifications.simulateFollow() - Simulate follow notification');
    }
  }, []);

  return (
    <ErrorBoundary>
      <ScrollLockProvider>
        <AuthProvider>
          <NotificationProvider>
            <UnreadMessagesProvider>
              <AppNavigator />
            </UnreadMessagesProvider>
          </NotificationProvider>
        </AuthProvider>
      </ScrollLockProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingIndicator: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00BFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 10 : 5,
  },
});
