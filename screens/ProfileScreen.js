import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { supabase } from '../utils/supabase';
import { useNavigation } from '@react-navigation/native';
import { Video } from 'expo-av'; // Keep this for now, but consider migrating to expo-video

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
    // IMPORTANT: If you are still getting "Text strings must be rendered within a <Text> component"
    // for ProfileScreen.js at line 20 (or similar), try deleting the line below and re-typing it exactly.
    const navigation = useNavigation();
    const [profile, setProfile] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const fetchProfileData = async () => {
            try {
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) {
                    console.error('Error getting session:', sessionError.message);
                    if (isMounted) {
                        setLoading(false);
                        Alert.alert('Error', 'Could not retrieve user session: ' + sessionError.message);
                    }
                    return;
                }

                if (!session) {
                    if (isMounted) {
                        setLoading(false);
                        // Optionally navigate to login if no session, or just show empty state
                        // navigation.replace('Login');
                        console.log('No active session found for profile screen. User must log in.');
                    }
                    return;
                }

                const userId = session.user.id;

                // Fetch user profile
                const { data: userProfile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (profileError && profileError.message.includes('rows returned')) {
                    console.warn('Profile not found for user:', userId);
                    if (isMounted) {
                        setProfile(null);
                    }
                } else if (profileError) {
                    throw profileError;
                }

                // Fetch user posts (images and videos)
                const { data: userPosts, error: postsError } = await supabase
                    .from('posts')
                    .select('*')
                    .eq('author_id', userId)
                    .order('created_at', { ascending: false });

                if (postsError) {
                    throw postsError;
                }

                if (isMounted) {
                    setProfile(userProfile);
                    setPosts(userPosts || []);
                    setLoading(false);
                }
            } catch (error) {
                console.error('Error fetching profile data:', error.message);
                Alert.alert('Error', 'Could not load profile: ' + error.message);
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchProfileData();

        return () => { isMounted = false; };
    }, []);

    if (loading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#00BFFF" />
                <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
        );
    }

    // If profile is null (e.g., user not logged in or profile not created yet)
    if (!profile) {
        return (
            <View style={styles.noProfileContainer}>
                <Text style={styles.noProfileText}>Please log in or create a profile.</Text>
                {/* Optionally, add a button to navigate to login/signup */}
                <TouchableOpacity
                    style={styles.loginButton}
                    onPress={() => navigation.navigate('Login')} // Assuming 'Login' is your login screen route
                >
                    <Text style={styles.loginButtonText}>Go to Login</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.headerContainer}>
                <View style={{ height: Platform.OS === 'android' ? 20 : 0 }} />

                {profile.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, { backgroundColor: '#333' }]} />
                )}
                <Text style={styles.username}>{profile.username || 'No Username'}</Text>

                <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => navigation.navigate('EditProfile')}
                >
                    <Text style={styles.editButtonText}>Edit Profile</Text>
                </TouchableOpacity>

                {profile.bio ? (
                    <Text style={styles.bio}>{profile.bio}</Text>
                ) : (
                    <Text style={styles.bio}>No bio yet.</Text>
                )}

                {profile.location ? (
                    <Text style={styles.location}>📍 {profile.location}</Text>
                ) : null}
            </View>

            <View style={{ height: 20 }} />

            <View style={styles.gridContainer}>
                {posts.length > 0 ? (
                    posts.map(post => (
                        <View key={post.id} style={styles.postContainer}>
                            {post.type === 'image' && post.media_url ? (
                                <Image
                                    source={{ uri: post.media_url }}
                                    style={styles.postThumbnail}
                                />
                            ) : post.type === 'video' && post.media_url ? (
                                <Video
                                    source={{ uri: post.media_url }}
                                    style={styles.postThumbnail}
                                    useNativeControls={false}
                                    resizeMode="cover"
                                    isLooping
                                    shouldPlay={false}
                                />
                            ) : (
                                <View style={styles.postThumbnailPlaceholder}>
                                    <Text style={styles.postThumbnailPlaceholderText}>No Media</Text>
                                </View>
                            )}
                        </View>
                    ))
                ) : (
                    <View style={styles.noPostsContainer}>
                        <Text style={styles.noPostsText}>No posts yet.</Text>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    loadingText: {
        color: '#fff',
        marginTop: 10,
        fontSize: 16,
    },
    noProfileContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
        padding: 20,
    },
    noProfileText: {
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 20,
    },
    loginButton: {
        backgroundColor: '#00BFFF',
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 8,
    },
    loginButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: 'bold',
    },
    headerContainer: {
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 20,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: '#00BFFF',
    },
    username: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 10,
    },
    bio: {
        color: '#aaa',
        fontSize: 14,
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    location: {
        color: '#555',
        fontSize: 13,
        marginTop: 4,
    },
    editButton: {
        backgroundColor: '#00BFFF',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 6,
        marginTop: 10,
    },
    editButtonText: {
        color: '#fff',
        fontWeight: '500',
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    postContainer: {
        width: width / 3,
        height: width / 3,
        padding: 0.5,
    },
    postThumbnail: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    postThumbnailPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
    },
    postThumbnailPlaceholderText: {
        color: '#888',
        fontSize: 12,
    },
    noPostsContainer: {
        width: '100%',
        alignItems: 'center',
        marginVertical: 20,
    },
    noPostsText: {
        color: '#555',
        fontSize: 16,
    },
});