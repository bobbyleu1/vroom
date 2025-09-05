import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  SafeAreaView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getIPadStyles } from '../utils/iPadStyles';
import { LocationUtils } from '../utils/locationService';

const MeetDetailScreen = ({ navigation, route }) => {
  const { meetId } = route.params;
  const { session } = useAuth();
  const [meet, setMeet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [attendees, setAttendees] = useState([]);
  
  const iPadStyles = getIPadStyles('#000');

  // Load meet details
  const loadMeetDetails = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get meet details with creator info
      const { data: meetData, error: meetError } = await supabase
        .from('meets')
        .select(`
          *,
          profiles:user_id (username, avatar_url),
          meet_attendance (
            status,
            user_id,
            profiles:user_id (username, avatar_url)
          )
        `)
        .eq('id', meetId)
        .single();

      if (meetError) throw meetError;

      if (meetData) {
        setMeet({
          ...meetData,
          user_is_attending: meetData.meet_attendance?.some(a => 
            a.user_id === session?.user?.id && a.status === 'going'
          ) || false,
          attendee_count: meetData.meet_attendance?.filter(a => a.status === 'going').length || 0,
          creator_username: meetData.profiles?.username,
          creator_avatar_url: meetData.profiles?.avatar_url,
        });

        // Set attendees list
        const goingAttendees = meetData.meet_attendance
          ?.filter(a => a.status === 'going')
          ?.map(a => ({
            user_id: a.user_id,
            username: a.profiles?.username,
            avatar_url: a.profiles?.avatar_url,
          })) || [];
        
        setAttendees(goingAttendees);
      }
    } catch (error) {
      console.error('Error loading meet details:', error);
      Alert.alert('Error', 'Failed to load meet details. Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [meetId, session?.user?.id, navigation]);

  useEffect(() => {
    loadMeetDetails();
  }, [loadMeetDetails]);

  // Handle RSVP
  const handleRSVP = useCallback(async () => {
    if (!session?.user) {
      Alert.alert('Login Required', 'Please log in to RSVP to meets.');
      return;
    }

    if (!meet) return;

    const newStatus = meet.user_is_attending ? 'not_going' : 'going';
    setRsvpLoading(true);
    
    try {
      // Optimistic update
      setMeet(prev => ({
        ...prev,
        user_is_attending: newStatus === 'going',
        attendee_count: prev.attendee_count + (newStatus === 'going' ? 1 : -1)
      }));

      const { data, error } = await supabase.rpc('handle_meet_rsvp', {
        meet_id_param: meetId,
        status_param: newStatus
      });

      if (error) throw error;

      // Reload to get updated attendees list
      await loadMeetDetails();

      console.log('RSVP success:', data);
    } catch (error) {
      console.error('RSVP error:', error);
      Alert.alert('Error', 'Failed to update RSVP. Please try again.');
      
      // Revert optimistic update
      setMeet(prev => ({
        ...prev,
        user_is_attending: !newStatus === 'going',
        attendee_count: prev.attendee_count - (newStatus === 'going' ? 1 : -1)
      }));
    } finally {
      setRsvpLoading(false);
    }
  }, [meetId, meet, session?.user, loadMeetDetails]);

  // Open location in maps
  const openInMaps = () => {
    if (!meet?.latitude || !meet?.longitude) {
      Alert.alert('Location Unavailable', 'Location coordinates are not available for this meet.');
      return;
    }

    const url = Platform.select({
      ios: `maps://app?daddr=${meet.latitude},${meet.longitude}`,
      android: `geo:${meet.latitude},${meet.longitude}?q=${meet.latitude},${meet.longitude}(${encodeURIComponent(meet.location_name || 'Meet Location')})`,
    });

    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fallback to Google Maps web
        const webUrl = `https://www.google.com/maps/search/?api=1&query=${meet.latitude},${meet.longitude}`;
        Linking.openURL(webUrl);
      }
    });
  };

  // Format date and time
  const formatDateTime = (dateTime, startsAt) => {
    const date = new Date(startsAt || dateTime);
    return {
      date: date.toLocaleDateString([], { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={iPadStyles.container}>
          <View style={iPadStyles.phoneContainer}>
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.headerButton} 
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Meet Details</Text>
              <View style={styles.headerButton} />
            </View>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#00BFFF" />
              <Text style={styles.loadingText}>Loading meet details...</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!meet) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Meet not found</Text>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { date, time } = formatDateTime(meet.date_time, meet.starts_at);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={iPadStyles.container}>
        <View style={iPadStyles.phoneContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Meet Details</Text>
            <View style={styles.headerButton} />
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* Flyer Image */}
            {meet.flyer_url && (
              <Image source={{ uri: meet.flyer_url }} style={styles.flyerImage} />
            )}

            {/* Content */}
            <View style={styles.content}>
              {/* Title and Creator */}
              <View style={styles.titleSection}>
                <Text style={styles.title}>{meet.title}</Text>
                <View style={styles.creatorInfo}>
                  <Image 
                    source={{ 
                      uri: meet.creator_avatar_url || 'https://via.placeholder.com/30x30/333/fff?text=U' 
                    }} 
                    style={styles.creatorAvatar} 
                  />
                  <Text style={styles.creatorText}>
                    by {meet.creator_username || 'Unknown'}
                  </Text>
                </View>
              </View>

              {/* Date & Time */}
              <View style={styles.detailSection}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar" size={20} color="#00BFFF" />
                  <Text style={styles.detailText}>{date}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="time" size={20} color="#00BFFF" />
                  <Text style={styles.detailText}>{time}</Text>
                </View>
              </View>

              {/* Location */}
              <View style={styles.detailSection}>
                <TouchableOpacity style={styles.locationSection} onPress={openInMaps}>
                  <View style={styles.detailRow}>
                    <Ionicons name="location" size={20} color="#00BFFF" />
                    <View style={styles.locationInfo}>
                      <Text style={styles.locationName}>{meet.location_name}</Text>
                      {meet.address && (
                        <Text style={styles.locationAddress}>{meet.address}</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Description */}
              {meet.description && (
                <View style={styles.detailSection}>
                  <Text style={styles.sectionTitle}>About</Text>
                  <Text style={styles.description}>{meet.description}</Text>
                </View>
              )}

              {/* Attendees */}
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>
                  Attendees ({meet.attendee_count})
                </Text>
                {attendees.length > 0 ? (
                  <View style={styles.attendeesList}>
                    {attendees.slice(0, 10).map((attendee, index) => (
                      <View key={`${attendee.user_id}-${index}`} style={styles.attendeeItem}>
                        <Image 
                          source={{ 
                            uri: attendee.avatar_url || 'https://via.placeholder.com/30x30/333/fff?text=U' 
                          }} 
                          style={styles.attendeeAvatar} 
                        />
                        <Text style={styles.attendeeName}>
                          {attendee.username || 'Unknown'}
                          {attendee.user_id === session?.user?.id && ' (You)'}
                        </Text>
                      </View>
                    ))}
                    {attendees.length > 10 && (
                      <Text style={styles.moreAttendeesText}>
                        +{attendees.length - 10} more
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.noAttendeesText}>
                    No one has RSVP'd yet. Be the first!
                  </Text>
                )}
              </View>
            </View>
          </ScrollView>

          {/* RSVP Button */}
          <View style={styles.rsvpSection}>
            <TouchableOpacity 
              style={[
                styles.rsvpButton,
                meet.user_is_attending && styles.rsvpButtonActive,
                rsvpLoading && styles.rsvpButtonDisabled
              ]}
              onPress={handleRSVP}
              disabled={rsvpLoading}
            >
              {rsvpLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons 
                    name={meet.user_is_attending ? "checkmark-circle" : "checkmark-circle-outline"} 
                    size={24} 
                    color="#FFF" 
                  />
                  <Text style={styles.rsvpButtonText}>
                    {meet.user_is_attending ? "You're Going!" : "RSVP to Attend"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
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
  headerButton: {
    padding: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 18,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // Space for RSVP button
  },
  flyerImage: {
    width: '100%',
    height: 250,
    backgroundColor: '#333',
  },
  content: {
    padding: 20,
  },
  titleSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
    lineHeight: 34,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    marginRight: 10,
  },
  creatorText: {
    fontSize: 16,
    color: '#999',
  },
  detailSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 16,
    color: '#FFF',
    marginLeft: 12,
  },
  locationSection: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
  },
  locationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  locationName: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  locationAddress: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  description: {
    fontSize: 16,
    color: '#CCC',
    lineHeight: 24,
  },
  attendeesList: {
    gap: 12,
  },
  attendeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    marginRight: 12,
  },
  attendeeName: {
    fontSize: 16,
    color: '#FFF',
  },
  moreAttendeesText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  noAttendeesText: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
  },
  rsvpSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#333',
    padding: 20,
  },
  rsvpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00BFFF',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  rsvpButtonActive: {
    backgroundColor: '#4CAF50',
  },
  rsvpButtonDisabled: {
    opacity: 0.6,
  },
  rsvpButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
});

export default MeetDetailScreen;