import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Modal,
  FlatList,
  Animated,
} from 'react-native';
import { supabase } from '../utils/supabase';
import { useNavigation } from '@react-navigation/native';
import { Video } from 'expo-av'; // Keep this for now, but consider migrating to expo-video
import { Ionicons, Feather } from '@expo/vector-icons';

// Assuming you have this asset for the heart animation
// If not, you'll need to create it or replace with a different icon/method
const heartIcon = require('../assets/icons/heart.png'); // Placeholder, ensure this path is correct

const { width, height } = Dimensions.get('window');

/**
 * ProfileScreen component displays the user's profile information and their uploaded posts.
 * It fetches profile data and posts from Supabase.
 *
 * IMPORTANT: If you are seeing "Text strings must be rendered within a <Text> component."
 * error pointing to lines like 'const navigation = useNavigation();' or other non-JSX lines,
 * this is almost always a misleading error message caused by Expo/Metro bundler caching issues.
 * The code itself is syntactically correct in terms of text rendering.
 *
 * TO RESOLVE THIS MISLEADING ERROR:
 * 1. Stop your Expo server (Ctrl+C in your terminal).
 * 2. Run the following command in your project directory:
 * rm -rf node_modules .expo yarn.lock && npm install && npx expo doctor --fix-dependencies && npx expo prebuild && npx expo run:ios
 * (Replace `npx expo run:ios` with `npx expo run:android` if you are on Android)
 * 3. After the command completes, completely uninstall/delete the Vroom app from your device/emulator.
 * 4. Open the newly built Vroom app (it will have your app's icon, not the generic Expo Go icon).
 * 5. Launch the development server: `npx expo start --dev-client`
 * This will force a full clean rebuild and should resolve the error.
 */
export default function ProfileScreen() {
    const navigation = useNavigation();
    const [profile, setProfile] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPostIndexToView, setSelectedPostIndexToView] = useState(null);
    const [currentViewedPostIndexInModal, setCurrentViewedPostIndexInModal] = useState(0);

    /**
     * useEffect hook to fetch profile data and posts when the component mounts.
     * It also handles session management and error logging.
     */
    useEffect(() => {
        let isMounted = true;

        const fetchProfileData = async () => {
            try {
                setLoading(true);
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) {
                    console.error('Error getting session:', sessionError.message);
                    if (isMounted) {
                        Alert.alert('Error', 'Could not retrieve user session: ' + sessionError.message);
                    }
                    return;
                }

                if (!session) {
                    console.log('No active session found for profile screen. User must log in.');
                    if (isMounted) {
                        setProfile(null);
                        setPosts([]);
                        setLoading(false);
                    }
                    return;
                }

                const userId = session.user.id;

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

                // Fetch user posts, including author's profile for display in modal
                const { data: userPosts, error: postsError } = await supabase
                    .from('posts')
                    .select('*, profiles(username, avatar_url)') // Fetch profile data of the author
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

    // Callback for FlatList to update the currently viewed item in the modal
    const onViewableItemsChangedInModal = useCallback(({ viewableItems }) => {
        if (viewableItems.length > 0) {
            setCurrentViewedPostIndexInModal(viewableItems[0].index);
        }
    }, []);

    // --- Inline PostDetailCard Component to match VideoCard ---
    const PostDetailCard = ({ item, index }) => {
        const isCurrent = index === currentViewedPostIndexInModal;
        const videoRef = useRef(null); // Local ref for each video in the list
        const [heartScale] = useState(new Animated.Value(0)); // State for heart animation

        // Auto-play/pause logic for videos in the FlatList
        useEffect(() => {
            if (videoRef.current) {
                if (isCurrent && item.file_type === 'video') {
                    videoRef.current.playAsync();
                } else {
                    videoRef.current.pauseAsync().catch(() => {});
                    videoRef.current.setPositionAsync(0).catch(() => {}); // Reset video to start when not visible
                }
            }
        }, [isCurrent, item.file_type]);

        // Heart animation function
        const animateHeart = () => {
            heartScale.setValue(0); // Reset scale before animating
            Animated.sequence([
                Animated.spring(heartScale, { toValue: 1, friction: 2, tension: 40, useNativeDriver: true }),
                Animated.spring(heartScale, { toValue: 0, friction: 2, tension: 40, useNativeDriver: true, delay: 500 }),
            ]).start();
        };

        // Double-tap handler
        const handleDoubleTap = (postId) => {
            animateHeart();
            // TODO: add Supabase like logic here if you want to increment likes
            console.log("Double tapped post:", postId);
        };

        return (
            <TouchableOpacity
                activeOpacity={1}
                onPress={() => handleDoubleTap(item.id)} // Double-tap functionality
                style={styles.fullScreenPostContent} // Use this style for the container
            >
                {/* Video/Image Player */}
                {item.file_type === 'video' ? (
                    <Video
                        ref={videoRef}
                        source={{ uri: item.media_url }}
                        style={styles.fullScreenMediaPlayer} // Use full screen media player style
                        resizeMode="cover" // Match VideoCard's resizeMode
                        isLooping // Loop video playback
                        shouldPlay={isCurrent} // Play only if it's the current item
                        posterSource={item.thumbnail_url ? { uri: item.thumbnail_url } : undefined}
                        onPlaybackStatusUpdate={(status) => {
                            if (status.didJustFinish && isCurrent) {
                                // Optionally advance to next video or close modal
                                // For now, if it finishes, it will pause due to isLooping=false and then user can swipe
                            }
                        }}
                    />
                ) : (
                    <Image
                        source={{ uri: item.media_url }}
                        style={styles.fullScreenMediaPlayer} // Use full screen media player style
                        resizeMode="cover" // Match VideoCard's resizeMode
                    />
                )}

                {/* Overlays: Username, Caption, Animated Heart */}
                <View style={styles.overlayContainer}>
                    {/* Username */}
                    {item.profiles?.username && (
                        <View style={styles.usernameBackground}>
                            <Text style={styles.usernameText}>
                                @{item.profiles.username}
                            </Text>
                        </View>
                    )}

                    {/* Caption */}
                    {item.content ? (
                        <View style={styles.captionContainer}>
                            <Text style={styles.captionText}>{item.content}</Text>
                        </View>
                    ) : null}

                    {/* Animated Heart Overlay */}
                    <Animated.Image
                        source={heartIcon}
                        style={[
                            styles.animatedHeart,
                            {
                                opacity: heartScale,
                                transform: [{ scale: heartScale }],
                            },
                        ]}
                    />
                </View>

                {/* Avatar */}
                {item.profiles?.avatar_url && (
                    <Image
                        source={{ uri: item.profiles.avatar_url }}
                        style={styles.avatarOverlay} // Use a new style for the overlay avatar
                    />
                )}

                {/* Action Bar (Placeholder - assuming you have this component) */}
                {/* You might need to import ActionBar from its path, e.g., import ActionBar from '../components/ActionBar'; */}
                <View style={styles.actionBarPlaceholder}>
                    <TouchableOpacity style={styles.actionButton}>
                        <Ionicons name="heart-outline" size={30} color="#fff" />
                        <Text style={styles.actionButtonTextSmall}>{item.like_count || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                        <Ionicons name="chatbubble-outline" size={30} color="#fff" />
                        <Text style={styles.actionButtonTextSmall}>{item.comment_count || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                        <Feather name="share-2" size={30} color="#fff" />
                        <Text style={styles.actionButtonTextSmall}>Share</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };
    // --- End of PostDetailCard Component ---


    if (loading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#00BFFF" />
                <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
        );
    }

    if (!profile) {
        return (
            <View style={styles.noProfileContainer}>
                <Text style={styles.noProfileText}>Please log in or create a profile to view this page.</Text>
                <TouchableOpacity
                    style={styles.loginButton}
                    onPress={() => navigation.navigate('Login')}
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
                    posts.map((post, index) => (
                        <TouchableOpacity
                            key={post.id}
                            style={styles.postContainer}
                            onPress={() => setSelectedPostIndexToView(index)}
                        >
                            {post.file_type === 'image' && post.media_url ? (
                                <Image
                                    source={{ uri: post.media_url }}
                                    style={styles.postThumbnail}
                                />
                            ) : post.file_type === 'video' && (post.thumbnail_url || post.media_url) ? (
                                <Video
                                    source={{ uri: post.media_url }}
                                    posterSource={post.thumbnail_url ? { uri: post.thumbnail_url } : undefined}
                                    useNativeControls={false}
                                    resizeMode="cover"
                                    isLooping
                                    shouldPlay={false}
                                    style={styles.postThumbnail}
                                />
                            ) : (
                                <View style={styles.postThumbnailPlaceholder}>
                                    <Text style={styles.postThumbnailPlaceholderText}>No Media</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))
                ) : (
                    <View style={styles.noPostsContainer}>
                        <Text style={styles.noPostsText}>No posts yet. Share something!</Text>
                    </View>
                )}
            </View>

            {/* Full-screen Post View Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={selectedPostIndexToView !== null}
                onRequestClose={() => setSelectedPostIndexToView(null)}
            >
                <View style={styles.fullScreenModalBackground}>
                    {selectedPostIndexToView !== null && (
                        <FlatList
                            data={posts}
                            keyExtractor={item => item.id}
                            pagingEnabled
                            snapToInterval={height}
                            decelerationRate="fast"
                            showsVerticalScrollIndicator={false}
                            initialScrollIndex={selectedPostIndexToView}
                            onViewableItemsChanged={onViewableItemsChangedInModal}
                            viewabilityConfig={{
                                itemVisiblePercentThreshold: 80
                            }}
                            getItemLayout={(data, index) => (
                                { length: height, offset: height * index, index }
                            )}
                            renderItem={({ item, index }) => (
                                <PostDetailCard item={item} index={index} />
                            )}
                        />
                    )}
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => setSelectedPostIndexToView(null)}
                    >
                        <Text style={styles.closeButtonText}>X</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
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
    // Styles for the full-screen modal background
    fullScreenModalBackground: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)', // Dark transparent background for the modal itself
    },
    // Styles for feed-like modal post content (copied/adapted from VideoCard)
    fullScreenPostContent: {
        width: width,
        height: height,
        backgroundColor: '#000', // Black background for full screen
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullScreenMediaPlayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
    },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        paddingBottom: 150, // Adjust this to make space for action bar
    },
    usernameBackground: {
        position: 'absolute',
        bottom: 45, // Adjusted position
        left: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    usernameText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    captionContainer: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        padding: 5,
    },
    captionText: {
        color: '#fff',
        fontSize: 16,
    },
    avatarOverlay: { // Renamed from 'avatar' to avoid conflict and indicate overlay
        position: 'absolute',
        right: 12,
        top: height * 0.45, // Adjusted position
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: '#00BFFF',
        backgroundColor: '#333',
        zIndex: 1,
    },
    animatedHeart: {
        position: 'absolute',
        alignSelf: 'center',
        top: '40%',
        width: 100,
        height: 100,
        tintColor: 'white',
    },
    // Placeholder for ActionBar styles
    actionBarPlaceholder: {
        position: 'absolute',
        right: 10,
        bottom: Platform.OS === 'ios' ? 50 : 30, // Adjust for iOS safe area
        alignItems: 'center',
        zIndex: 1,
    },
    actionButton: {
        alignItems: 'center',
        marginBottom: 20, // Space between buttons
    },
    actionButtonTextSmall: { // Smaller text for action bar counts
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 5,
    },
    // Close button for the modal
    closeButton: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 40 : 60,
        right: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2, // Ensure close button is on top of everything
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
});
