import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  SafeAreaView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { locationService, LocationUtils, LOCATION_ERROR_TYPES } from '../utils/locationService';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getIPadStyles, isTablet } from '../utils/iPadStyles';
import ErrorBoundary from '../components/ErrorBoundary';

const { width, height } = Dimensions.get('window');

const FindMeetScreen = ({ navigation }) => {
  const { session } = useAuth();
  const [meets, setMeets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  
  const locationAttempted = useRef(false);
  const iPadStyles = getIPadStyles('#000');

  // Get user's location with complete iOS 18 bypass
  const getUserLocation = useCallback(async (showLoading = true) => {
    if (locationAttempted.current) return;
    locationAttempted.current = true;

    try {
      if (showLoading) setLoading(true);
      setLocationError(null);
      
      // Check if we're on problematic iOS version - if so, skip location entirely
      if (locationService.isIOS18OrLater) {
        console.log('[FINDMEET] Problematic iOS 18.6.x detected - skipping location, loading all meets');
        setLocationError('Location disabled on iOS 18.6.x for stability');
        setLocationPermissionGranted(false);
        await loadMeetsWithoutLocation();
        return;
      }
      
      // Add overall timeout to prevent complete hanging on older iOS
      const overallTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Overall location timeout - using fallback')), 8000);
      });
      
      const locationPromise = locationService.getCurrentLocation({
        timeout: 6000, // Even shorter timeout
        maxAge: 120000, // 2 minutes
      });
      
      const location = await Promise.race([locationPromise, overallTimeout]);
      
      setUserLocation(location);
      setLocationPermissionGranted(true);
      console.log('Got user location:', location);
      
      // Load meets with the new location
      await loadNearbyMeets(location);
      
    } catch (error) {
      console.error('Location error:', error);
      setLocationError(error.message);
      setLocationPermissionGranted(false);
      
      // Always fall back silently - no more alerts
      console.log('Falling back to meets without location due to:', error.message);
      await loadMeetsWithoutLocation().catch(err => {
        console.error('Failed to load meets as fallback:', err);
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [loadNearbyMeets, loadMeetsWithoutLocation]);

  const retryLocationAccess = useCallback(async () => {
    locationAttempted.current = false;
    await getUserLocation();
  }, [getUserLocation]);

  // Load meets without location (show all meets)
  const loadMeetsWithoutLocation = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('meets')
        .select(`
          *,
          profiles:user_id (username, avatar_url),
          meet_attendance (
            status,
            user_id
          )
        `)
        .eq('is_hidden', false)
        .gt('date_time', new Date().toISOString())
        .order('date_time', { ascending: true })
        .limit(50);

      if (error) throw error;

      const meetsWithStats = data?.map(meet => ({
        ...meet,
        distance_km: null, // No distance without location
        attendee_count: meet.meet_attendance?.filter(a => a.status === 'going').length || 0,
        user_is_attending: meet.meet_attendance?.some(a => 
          a.user_id === session?.user?.id && a.status === 'going'
        ) || false,
        creator_username: meet.profiles?.username,
        creator_avatar_url: meet.profiles?.avatar_url,
      })) || [];

      setMeets(meetsWithStats);
    } catch (error) {
      console.error('Error loading meets without location:', error);
      Alert.alert('Error', 'Failed to load meets. Please try again.');
    }
  }, [session?.user?.id]);

  // Load nearby meets using user's location
  const loadNearbyMeets = useCallback(async (location = userLocation) => {
    if (!location) {
      await loadMeetsWithoutLocation();
      return;
    }

    try {
      console.log(`Loading nearby meets for location: ${location.latitude}, ${location.longitude}`);
      
      // Always use fallback query since RPC may not exist
      console.log('Loading meets with fallback query (no RPC dependency)');
      let data, error;
      
      try {
        const result = await supabase
          .from('meets')
          .select(`
            *,
            profiles:user_id (username, avatar_url),
            meet_attendance (
              status,
              user_id
            )
          `)
          .eq('is_hidden', false)
          .gt('date_time', new Date().toISOString())
          .order('date_time', { ascending: true })
          .limit(50);
        data = result.data;
        error = result.error;
        
        console.log(`[MEETS] Direct query loaded ${data?.length || 0} meets`);
      } catch (queryError) {
        console.error('Direct meets query failed:', queryError);
        error = queryError;
        data = [];
      }

      if (error) throw error;

      const meetsWithStats = data?.map(meet => ({
        ...meet,
        distance_km: meet.latitude && meet.longitude ? 
          LocationUtils.calculateDistance(
            location.latitude, 
            location.longitude, 
            meet.latitude, 
            meet.longitude
          ) : null,
        attendee_count: meet.meet_attendance?.filter(a => a.status === 'going').length || 0,
        user_is_attending: meet.meet_attendance?.some(a => 
          a.user_id === session?.user?.id && a.status === 'going'
        ) || false,
        creator_username: meet.profiles?.username,
        creator_avatar_url: meet.profiles?.avatar_url,
      })) || [];

      // Sort by distance if we have location data
      const sortedMeets = meetsWithStats.sort((a, b) => {
        if (a.distance_km === null) return 1;
        if (b.distance_km === null) return -1;
        return a.distance_km - b.distance_km;
      });

      setMeets(sortedMeets);
      console.log(`Loaded ${sortedMeets.length} nearby meets`);
      
    } catch (error) {
      console.error('Error loading nearby meets:', error);
      // Fallback to loading without location
      await loadMeetsWithoutLocation();
    }
  }, [userLocation, loadMeetsWithoutLocation, session?.user?.id]);

  // Load meets data
  const loadMeets = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      
      if (userLocation && locationPermissionGranted) {
        await loadNearbyMeets();
      } else {
        await loadMeetsWithoutLocation();
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [userLocation, locationPermissionGranted, loadNearbyMeets, loadMeetsWithoutLocation]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refresh location if we have permission
      if (locationPermissionGranted) {
        const freshLocation = await locationService.getLocationWithFallback();
        setUserLocation(freshLocation);
        await loadNearbyMeets(freshLocation);
      } else {
        await loadMeetsWithoutLocation();
      }
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, [locationPermissionGranted, loadNearbyMeets, loadMeetsWithoutLocation]);

  // Load data when screen focuses
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        try {
          if (!locationAttempted.current) {
            await getUserLocation();
          } else {
            await loadMeets();
          }
        } catch (error) {
          console.error('Error loading data on focus:', error);
          // Fallback to load meets without location
          try {
            await loadMeetsWithoutLocation();
          } catch (fallbackError) {
            console.error('Fallback loading failed:', fallbackError);
            // If everything fails, just show loading false to prevent white screen
            setLoading(false);
          }
        }
      };
      
      // Add timeout and error recovery
      const loadWithTimeout = () => {
        const timeoutId = setTimeout(() => {
          console.warn('FindMeet data loading timed out');
          setLoading(false);
        }, 8000); // 8 second max
        
        loadData()
          .catch(error => {
            console.error('Critical error in FindMeet loading:', error);
            setLoading(false);
            // Don't crash - just show loading false
          })
          .finally(() => {
            clearTimeout(timeoutId);
          });
      };
      
      // Wrap in try-catch to prevent any synchronous crashes
      try {
        loadWithTimeout();
      } catch (syncError) {
        console.error('Sync error in FindMeet focus effect:', syncError);
        setLoading(false);
      }
    }, []) // Remove unstable dependencies
  );

  // Handle RSVP
  const handleRSVP = useCallback(async (meetId, currentStatus) => {
    if (!session?.user) {
      Alert.alert('Login Required', 'Please log in to RSVP to meets.');
      return;
    }

    const newStatus = currentStatus === 'going' ? 'not_going' : 'going';
    
    try {
      // Optimistic update
      setMeets(prev => prev.map(meet => 
        meet.id === meetId 
          ? {
              ...meet,
              user_is_attending: newStatus === 'going',
              attendee_count: meet.attendee_count + (newStatus === 'going' ? 1 : -1)
            }
          : meet
      ));

      // Use direct upsert instead of RPC to avoid dependency issues
      const { data, error } = await supabase
        .from('meet_attendance')
        .upsert({
          meet_id: meetId,
          user_id: session.user.id,
          status: newStatus,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'meet_id,user_id'
        });

      if (error) throw error;

      console.log('RSVP success:', data);
    } catch (error) {
      console.error('RSVP error:', error);
      Alert.alert('Error', 'Failed to update RSVP. Please try again.');
      
      // Revert optimistic update
      setMeets(prev => prev.map(meet => 
        meet.id === meetId 
          ? {
              ...meet,
              user_is_attending: currentStatus === 'going',
              attendee_count: meet.attendee_count - (newStatus === 'going' ? 1 : -1)
            }
          : meet
      ));
    }
  }, [session?.user]);

  // Format date and time
  const formatDateTime = (dateTime, startsAt) => {
    const date = new Date(startsAt || dateTime);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
    
    if (isToday) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (isTomorrow) {
      return `Tomorrow at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  // Render meet card
  const renderMeetCard = ({ item, index }) => (
    <TouchableOpacity 
      style={styles.meetCard}
      onPress={() => navigation.navigate('MeetDetail', { meetId: item.id })}
      activeOpacity={0.8}
    >
      {/* Flyer Image */}
      {item.flyer_url && (
        <Image source={{ uri: item.flyer_url }} style={styles.flyerImage} />
      )}
      
      {/* Content */}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.meetTitle} numberOfLines={2}>{item.title}</Text>
          {item.distance_km !== null && (
            <Text style={styles.distanceText}>
              {LocationUtils.formatDistance(item.distance_km)}
            </Text>
          )}
        </View>
        
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color="#999" />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.location_name || item.address || 'Location not specified'}
          </Text>
        </View>
        
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={16} color="#999" />
          <Text style={styles.timeText}>
            {formatDateTime(item.date_time, item.starts_at)}
          </Text>
        </View>

        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        
        <View style={styles.cardFooter}>
          <View style={styles.creatorInfo}>
            <Image 
              source={{ 
                uri: item.creator_avatar_url || 'https://via.placeholder.com/30x30/333/fff?text=U' 
              }} 
              style={styles.creatorAvatar} 
            />
            <Text style={styles.creatorName}>
              by {item.creator_username || 'Unknown'}
            </Text>
          </View>
          
          <View style={styles.cardActions}>
            <TouchableOpacity 
              style={styles.attendeeInfo}
              disabled
            >
              <Ionicons name="people-outline" size={16} color="#999" />
              <Text style={styles.attendeeCount}>{item.attendee_count}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.rsvpButton,
                item.user_is_attending && styles.rsvpButtonActive
              ]}
              onPress={() => handleRSVP(item.id, item.user_is_attending ? 'going' : 'not_going')}
            >
              <Ionicons 
                name={item.user_is_attending ? "checkmark-circle" : "checkmark-circle-outline"} 
                size={20} 
                color={item.user_is_attending ? "#00BFFF" : "#999"} 
              />
              <Text style={[
                styles.rsvpText,
                item.user_is_attending && styles.rsvpTextActive
              ]}>
                {item.user_is_attending ? "Going" : "RSVP"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Render location error state
  const renderLocationError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="location-outline" size={48} color="#666" />
      <Text style={styles.errorTitle}>Location Access Needed</Text>
      <Text style={styles.errorMessage}>
        {locationError === LOCATION_ERROR_TYPES.PERMISSION_DENIED
          ? "Enable location access to find meets near you"
          : "Having trouble getting your location"}
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={retryLocationAccess}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={48} color="#666" />
      <Text style={styles.emptyTitle}>No Meets Found</Text>
      <Text style={styles.emptyMessage}>
        {userLocation 
          ? "No meets found in your area. Try expanding your search radius or create the first meet!"
          : "No upcoming meets found. Create the first meet in your area!"
        }
      </Text>
      <TouchableOpacity 
        style={styles.createButton} 
        onPress={() => navigation.navigate('CreateMeet')}
      >
        <Ionicons name="add-circle" size={20} color="#FFF" />
        <Text style={styles.createButtonText}>Create a Meet</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={iPadStyles.container}>
          <View style={iPadStyles.phoneContainer}>
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton} 
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Find a Meet</Text>
              <TouchableOpacity 
                style={styles.createHeaderButton}
                onPress={() => navigation.navigate('CreateMeet')}
              >
                <Ionicons name="add" size={24} color="#00BFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#00BFFF" />
              <Text style={styles.loadingText}>Finding meets near you...</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={iPadStyles.container}>
          <View style={iPadStyles.phoneContainer}>
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton} 
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Find a Meet</Text>
              <TouchableOpacity 
                style={styles.createHeaderButton}
                onPress={() => navigation.navigate('CreateMeet')}
              >
                <Ionicons name="add" size={24} color="#00BFFF" />
              </TouchableOpacity>
            </View>

            {locationError && !userLocation && (
              <View style={styles.locationErrorBanner}>
                <Ionicons name="location-outline" size={16} color="#FF6B6B" />
                <Text style={styles.locationErrorText}>
                  Showing all meets - location unavailable
                </Text>
                <TouchableOpacity onPress={retryLocationAccess}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            <FlatList
              data={meets}
              renderItem={renderMeetCard}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor="#00BFFF"
                  colors={["#00BFFF"]}
                />
              }
              ListEmptyComponent={locationError && !userLocation ? renderLocationError : renderEmptyState}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    flex: 1,
    textAlign: 'center',
  },
  createHeaderButton: {
    padding: 8,
  },
  locationErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  locationErrorText: {
    color: '#999',
    fontSize: 14,
    flex: 1,
    marginLeft: 8,
  },
  retryText: {
    color: '#00BFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    fontSize: 16,
    marginTop: 16,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  meetCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  flyerImage: {
    width: '100%',
    height: 160,
    backgroundColor: '#333',
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  meetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    flex: 1,
    marginRight: 8,
  },
  distanceText: {
    fontSize: 14,
    color: '#00BFFF',
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  locationText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 6,
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 6,
  },
  description: {
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  creatorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#333',
    marginRight: 8,
  },
  creatorName: {
    fontSize: 12,
    color: '#999',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  attendeeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeCount: {
    fontSize: 14,
    color: '#999',
    marginLeft: 4,
  },
  rsvpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  rsvpButtonActive: {
    backgroundColor: 'rgba(0, 191, 255, 0.2)',
  },
  rsvpText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 4,
    fontWeight: '500',
  },
  rsvpTextActive: {
    color: '#00BFFF',
  },
  separator: {
    height: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 16,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00BFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default FindMeetScreen;