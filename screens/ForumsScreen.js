import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Platform, TextInput, ActivityIndicator, ScrollView, Image, Alert } from 'react-native';
import { Ionicons, Feather, AntDesign } from '@expo/vector-icons';

// Import the NativeAdCard component to render ads within the posts list
import NativeAdCard from '../components/NativeAdCard';
import ForumPostFormModal from '../components/ForumPostFormModal';
import { StatusBar } from 'expo-status-bar';

// Import Supabase client
import { supabase } from '../utils/supabase'; // Assuming supabase client is correctly exported from this path

// Utility function to format time (e.g., "5 minutes ago", "2 days ago")
const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30.44); // Average days in a month
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365.25); // Average days in a year
  return `${years}y ago`;
};


const ForumsScreen = ({ navigation, route }) => {
  const { communityName: initialCommunityName } = route.params || {}; // Get community name if passed

  const [searchQuery, setSearchQuery] = useState('');
  const [hotTrendingPosts, setHotTrendingPosts] = useState([]);
  const [myCommunities, setMyCommunities] = useState([]);
  const [searchResultsPosts, setSearchResultsPosts] = useState([]);
  const [searchResultsCommunities, setSearchResultsCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentCommunity, setCurrentCommunity] = useState(initialCommunityName); // State to manage if we're viewing a specific community
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);

  // Frequency for inserting ads into the posts lists. After every N posts
  // an advertisement will be displayed. Feel free to adjust this value
  // to tune the ad density.
  const ADS_FREQUENCY = 10;

  /**
   * Helper function to interleave advertisement markers into an array of
   * posts. It returns a new array where every Nth element is an object
   * with `isAd: true`. This approach keeps the original posts intact
   * while adding placeholders that our render function will detect and
   * replace with a NativeAdCard.
   *
   * @param {Array} arr - array of posts
   * @returns {Array} augmented array containing posts and ad markers
   */
  const insertAdMarkers = (arr) => {
    const result = [];
    arr.forEach((item, index) => {
      result.push(item);
      if ((index + 1) % ADS_FREQUENCY === 0) {
        result.push({ isAd: true });
        console.log(`ForumsScreen: Inserted ad after item ${index + 1}`);
      }
    });
    console.log(`ForumsScreen: Total items: ${arr.length}, Result with ads: ${result.length}`);
    return result;
  };

  // Function to fetch posts for a specific community
  const fetchPostsForCommunity = useCallback(async (communityNameToFetch) => {
    setLoading(true);
    try {
      // First, get the category_id for the given community name
      const { data: categoryData, error: categoryError } = await supabase
        .from('forum_categories')
        .select('id')
        .eq('name', communityNameToFetch)
        .single();

      if (categoryError || !categoryData) {
        console.error('Error fetching community ID:', categoryError || 'Community not found');
        setHotTrendingPosts([]); // Clear posts if community not found
        return;
      }

      const categoryId = categoryData.id;

      // Then, fetch posts for that specific category
      const { data: postsData, error: postsError } = await supabase
        .from('forum_posts')
        .select('*, forum_categories(name), profiles(username)')
        .eq('category_id', categoryId)
        .order('upvotes', { ascending: false }); // Order by hot/trending

      if (postsError) {
        console.error('Error fetching community posts:', postsError);
      } else {
        setHotTrendingPosts(postsData.map(post => ({
            ...post,
            community_name: post.forum_categories?.name || 'Unknown Community',
            author_username: post.profiles?.username || 'Anonymous',
            created_at_formatted: formatTimeAgo(post.created_at),
            content_snippet: post.content ? post.content.substring(0, 100) + (post.content.length > 100 ? '...' : '') : '',
        })));
      }
    } catch (error) {
      console.error('Error in fetchPostsForCommunity:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to fetch initial hot/trending posts and user's communities (for explore view)
  const fetchInitialExploreData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch hot/trending posts
      const { data: postsData, error: postsError } = await supabase
        .from('forum_posts')
        .select('*, forum_categories(name), profiles(username)')
        .order('upvotes', { ascending: false })
        .limit(10); // Limit for an explore page

      if (postsError) {
        console.error('Error fetching hot/trending posts:', postsError);
      } else {
        setHotTrendingPosts(postsData.map(post => ({
            ...post,
            community_name: post.forum_categories?.name || 'Unknown Community',
            author_username: post.profiles?.username || 'Anonymous',
            created_at_formatted: formatTimeAgo(post.created_at),
            content_snippet: post.content ? post.content.substring(0, 100) + (post.content.length > 100 ? '...' : '') : '',
        })));
      }

      // Fetch user's joined communities
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('Error getting session:', sessionError);
      }
      const userId = sessionData?.session?.user?.id;

      if (userId) {
        const { data: memberData, error: memberError } = await supabase
          .from('forum_members')
          .select('category_id, forum_categories(id, name, description, member_count)')
          .eq('user_id', userId);

        if (memberError) {
          console.error('Error fetching user communities:', memberError);
        } else {
          setMyCommunities(memberData.map(member => member.forum_categories));
        }
      } else {
        setMyCommunities([]);
      }

    } catch (error) {
      console.error('Error in fetchInitialExploreData:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to perform search across communities and posts
  const performSearch = useCallback(async (query) => {
    if (query.trim() === '') {
      setSearchResultsPosts([]);
      setSearchResultsCommunities([]);
      return;
    }

    setSearchLoading(true);
    try {
      // Search for communities
      const { data: communitiesData, error: communitiesError } = await supabase
        .from('forum_categories')
        .select('id, name, description, member_count')
        .ilike('name', `%${query}%`);

      if (communitiesError) {
        console.error('Error searching communities:', communitiesError);
      } else {
        setSearchResultsCommunities(communitiesData);
      }

      // Search for posts (title OR content) and order by upvotes
      const { data: postsData, error: postsError } = await supabase
        .from('forum_posts')
        .select('*, forum_categories(name), profiles(username)')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`) // Search title OR content
        .order('upvotes', { ascending: false }); // Rank by hot/trending

      if (postsError) {
        console.error('Error searching posts:', postsError);
      } else {
        setSearchResultsPosts(postsData.map(post => ({
            ...post,
            community_name: post.forum_categories?.name || 'Unknown Community',
            author_username: post.profiles?.username || 'Anonymous',
            created_at_formatted: formatTimeAgo(post.created_at),
            content_snippet: post.content ? post.content.substring(0, 100) + (post.content.length > 100 ? '...' : '') : '',
        })));
      }

    } catch (error) {
      console.error('Error in performSearch:', error.message);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Effect to handle initial data fetch based on route params
  useEffect(() => {
    if (initialCommunityName) {
      setCurrentCommunity(initialCommunityName);
      fetchPostsForCommunity(initialCommunityName);
    } else {
      setCurrentCommunity(null); // Ensure we're in explore mode
      fetchInitialExploreData();
    }
  }, [initialCommunityName, fetchPostsForCommunity, fetchInitialExploreData]);

  // Effect to trigger search when searchQuery changes
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery.trim() !== '') { // Only perform search if query is not empty
        performSearch(searchQuery);
      } else {
        // If search query becomes empty, clear results and revert to initial data display
        setSearchResultsPosts([]);
        setSearchResultsCommunities([]);
        if (!currentCommunity) { // Only refetch initial explore data if not in a specific community view
          fetchInitialExploreData();
        }
      }
    }, 500); // Debounce search to avoid too many requests

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery, performSearch, currentCommunity, fetchInitialExploreData]);

  // Handle upvote/downvote for forum posts
  const handleVote = async (postId, voteType) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Authentication Required', 'Please log in to vote on posts.');
        return;
      }

      // Check current vote status
      const { data: existingVote, error: voteCheckError } = await supabase
        .from('forum_votes')
        .select('vote_type')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .single();

      if (voteCheckError && voteCheckError.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error checking vote:', voteCheckError);
        return;
      }

      let operation;
      let increment;
      
      if (existingVote) {
        if (existingVote.vote_type === voteType) {
          // Remove vote if clicking the same vote type
          await supabase
            .from('forum_votes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', user.id);
          
          increment = voteType === 'upvote' ? -1 : 1; // Reverse the vote
          operation = 'removed';
        } else {
          // Change vote type
          await supabase
            .from('forum_votes')
            .update({ vote_type: voteType })
            .eq('post_id', postId)
            .eq('user_id', user.id);
          
          increment = voteType === 'upvote' ? 2 : -2; // Change from down to up or vice versa
          operation = 'changed';
        }
      } else {
        // Add new vote
        await supabase
          .from('forum_votes')
          .insert({ post_id: postId, user_id: user.id, vote_type: voteType });
        
        increment = voteType === 'upvote' ? 1 : -1;
        operation = 'added';
      }

      // Update post upvotes count using RPC function
      const { error: updateError } = await supabase
        .rpc('increment_forum_post_upvotes', {
          post_id: postId,
          increment_by: increment
        });

      if (updateError) {
        console.error('Error updating post votes:', updateError);
        return;
      }

      // Update local state to reflect the change
      const updatePosts = (posts) => posts.map(post => 
        post.id === postId 
          ? { ...post, upvotes: (post.upvotes || 0) + increment }
          : post
      );

      setHotTrendingPosts(prev => updatePosts(prev));
      setSearchResultsPosts(prev => updatePosts(prev));

      console.log(`Vote ${operation}: ${voteType} on post ${postId}`);

    } catch (error) {
      console.error('Error handling vote:', error);
      Alert.alert('Error', 'Failed to update vote. Please try again.');
    }
  };

  // Handle "See All" button press to show all posts
  const handleSeeAllPosts = () => {
    // Navigate to a dedicated screen or expand the current view
    // For now, let's set a flag to show more posts or navigate to a new screen
    // Option 1: Navigate to a dedicated "All Posts" screen (requires creating new screen)
    // Option 2: Expand current view to show all posts (simpler approach)
    
    // Let's use option 2 - fetch and display more posts
    fetchAllHotTrendingPosts();
  };

  // Fetch all hot/trending posts (not just the limited preview)
  const fetchAllHotTrendingPosts = async () => {
    try {
      setLoading(true);
      
      const { data: postsData, error: postsError } = await supabase
        .from('forum_posts')
        .select('*, forum_categories(name), profiles(username)')
        .order('upvotes', { ascending: false })
        .limit(50); // Show more posts when "See All" is clicked

      if (postsError) {
        console.error('Error fetching all hot trending posts:', postsError.message);
        return;
      }

      // Format and set the data
      const formattedPosts = postsData.map(post => ({
        ...post,
        community_name: post.forum_categories?.name || 'Unknown',
        author_username: post.profiles?.username || 'Unknown',
        created_at_formatted: formatTimeAgo(post.created_at),
        content_snippet: post.content ? post.content.substring(0, 150) + (post.content.length > 150 ? '...' : '') : null,
      }));

      setHotTrendingPosts(formattedPosts);
    } catch (error) {
      console.error('Error in fetchAllHotTrendingPosts:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Render item for Hot/Trending Posts (and search results posts)
  const renderHotTrendingPostItem = ({ item }) => {
    // If this is an ad marker, render the native ad card. The component
    // itself determines the appropriate unit ID based on platform and
    // handles loading internally. It blends seamlessly with the post
    // cards due to similar styling.
    if (item.isAd) {
      return <NativeAdCard />;
    }

    // Format vote count
    const formatVotes = (count) => {
      if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
      return count.toString();
    };

    return (
      <View style={styles.postCard}>
        <TouchableOpacity 
          style={styles.postMainContent}
          onPress={() => navigation.navigate('ForumPostDetail', { postId: item.id })}
          activeOpacity={0.95}
        >
          <View style={styles.postHeader}>
            <Text style={styles.postCommunity}>r/{item.community_name}</Text>
            <Text style={styles.postMeta}>• Posted by u/{item.author_username} • {item.created_at_formatted}</Text>
          </View>
          
          <Text style={styles.postTitle} numberOfLines={2}>{item.title}</Text>
          
          {item.content_snippet && (
            <Text style={styles.postSnippet} numberOfLines={3}>{item.content_snippet}</Text>
          )}

          {/* Thumbnail for media posts */}
          {item.thumbnail_url && (
            <Image 
              source={{ uri: item.thumbnail_url }} 
              style={styles.postThumbnail}
              resizeMode="cover"
            />
          )}
          
          <View style={styles.postActions}>
            <View style={styles.voteSection}>
              <TouchableOpacity 
                style={styles.voteButton}
                onPress={() => handleVote(item.id, 'upvote')}
              >
                <AntDesign name="caretup" size={16} color="#878A8C" />
              </TouchableOpacity>
              <Text style={styles.voteCount}>{formatVotes(item.upvotes || 0)}</Text>
              <TouchableOpacity 
                style={styles.voteButton}
                onPress={() => handleVote(item.id, 'downvote')}
              >
                <AntDesign name="caretdown" size={16} color="#878A8C" />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="chatbubble-outline" size={16} color="#878A8C" />
              <Text style={styles.actionText}>{item.comment_count || 0}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}>
              <Feather name="share" size={16} color="#878A8C" />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}>
              <Feather name="bookmark" size={16} color="#878A8C" />
              <Text style={styles.actionText}>Save</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Render item for My Communities (and search results communities)
  const renderMyCommunityItem = ({ item }) => (
    <TouchableOpacity
      style={styles.myCommunityCard}
      onPress={() => navigation.navigate('Forums', { communityName: item.name })} // Pass community name for navigation
    >
      <Text style={styles.myCommunityName}>v/{item.name}</Text> {/* Add v/ prefix here */}
      <Text style={styles.myCommunityDescription}>{item.description}</Text>
      <View style={styles.myCommunityStats}>
        <Feather name="users" size={16} color="#B0B0B0" />
        <Text style={styles.myCommunityMembers}>{item.member_count} members</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#00BFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{currentCommunity ? `v/${currentCommunity}` : 'Forums'}</Text> {/* Dynamic header title */}
        <View style={styles.placeholder} />
      </View>

      {/* Only show search bar if not in a specific community view */}
      {!currentCommunity && (
        <View style={styles.searchBarContainer}>
          <Feather name="search" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search communities or topics..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}


      {loading || searchLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00BFFF" />
          <Text style={styles.loadingText}>
            {searchLoading ? 'Searching...' : 'Loading forums...'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          {searchQuery === '' && !currentCommunity ? ( // Default Explore View
            <>
              {/* Hot/Trending Posts Section */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Hot & Trending Posts</Text>
                <TouchableOpacity onPress={handleSeeAllPosts}>
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>
              {hotTrendingPosts.length > 0 ? (
                <FlatList
                  data={insertAdMarkers(hotTrendingPosts)}
                  renderItem={renderHotTrendingPostItem}
                  keyExtractor={(item, index) => (item.isAd ? `ad-${index}` : item.id)}
                  contentContainerStyle={styles.postsListContainer}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.noResultsText}>No hot or trending posts available.</Text>
              )}


              {/* My Communities Section */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>My Communities</Text>
                <TouchableOpacity>
                  <Text style={styles.seeAllText}>Manage</Text>
                </TouchableOpacity>
              </View>
              {myCommunities.length > 0 ? (
                <FlatList
                  data={myCommunities}
                  renderItem={renderMyCommunityItem}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.myCommunitiesListContainer}
                />
              ) : (
                <Text style={styles.noResultsText}>You haven't joined any communities yet.</Text>
              )}
            </>
          ) : searchQuery !== '' ? ( // Search Results View
            <View style={styles.searchResultsContainer}>
              <Text style={styles.searchResultTitle}>Community Results</Text>
              {searchResultsCommunities.length > 0 ? (
                <FlatList
                  data={searchResultsCommunities}
                  renderItem={renderMyCommunityItem}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.listContainer}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.noResultsText}>No communities found matching "{searchQuery}".</Text>
              )}

              <Text style={styles.searchResultTitle}>Post Results</Text>
              {searchResultsPosts.length > 0 ? (
                <FlatList
                  data={insertAdMarkers(searchResultsPosts)}
                  renderItem={renderHotTrendingPostItem}
                  keyExtractor={(item, index) => (item.isAd ? `ad-${index}` : item.id)}
                  contentContainerStyle={styles.listContainer}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.noResultsText}>No posts found matching "{searchQuery}".</Text>
              )}
            </View>
          ) : ( // Specific Community View (when currentCommunity is set)
            <View style={styles.communityPostsView}>
              <Text style={styles.communityPostsHeader}>Posts in v/{currentCommunity}</Text>
              {hotTrendingPosts.length > 0 ? ( // hotTrendingPosts now holds posts for the specific community
                <FlatList
                  data={insertAdMarkers(hotTrendingPosts)}
                  renderItem={renderHotTrendingPostItem}
                  keyExtractor={(item, index) => (item.isAd ? `ad-${index}` : item.id)}
                  contentContainerStyle={styles.postsListContainer}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.noResultsText}>No posts found in v/{currentCommunity}.</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}
      
      {/* Floating Action Button for creating posts */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreatePostModal(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Forum Post Creation Modal */}
      <ForumPostFormModal
        visible={showCreatePostModal}
        onClose={() => setShowCreatePostModal(false)}
        onSuccess={() => {
          // Refresh posts after successful creation
          if (currentCommunity) {
            fetchPostsForCommunity(currentCommunity);
          } else {
            fetchInitialExploreData();
          }
        }}
        communityName={currentCommunity}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#030303', // Reddit dark background
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  placeholder: {
    width: 38, // To visually balance the back button
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E', // Darker background for search bar
    borderRadius: 10,
    marginHorizontal: 15,
    marginVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#00BFFF', // Blue border
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: '#E0E0E0', // Light gray text
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
    paddingBottom: 20, // Add padding for bottom nav bar
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200, // Ensure it takes up some space
  },
  loadingText: {
    color: '#B0B0B0',
    marginTop: 10,
    fontSize: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  seeAllText: {
    color: '#00BFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  postsListContainer: {
    paddingHorizontal: 15,
  },
  postCard: {
    backgroundColor: '#1A1A1B',
    marginBottom: 8,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#343536',
  },
  postMainContent: {
    padding: 12,
  },
  postHeader: {
    marginBottom: 8,
  },
  postCommunity: {
    fontSize: 12,
    color: '#1A73E8',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  postMeta: {
    fontSize: 12,
    color: '#7C7C7C',
    flexWrap: 'wrap',
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#D7DADC',
    marginBottom: 6,
    lineHeight: 20,
  },
  postSnippet: {
    fontSize: 14,
    color: '#7C7C7C',
    marginBottom: 8,
    lineHeight: 18,
  },
  postThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#343536',
  },
  voteSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#272729',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  voteButton: {
    padding: 4,
  },
  voteCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#878A8C',
    marginHorizontal: 8,
    minWidth: 20,
    textAlign: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  actionText: {
    fontSize: 12,
    color: '#878A8C',
    marginLeft: 4,
    fontWeight: '500',
  },
  myCommunitiesListContainer: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  myCommunityCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 15,
    marginRight: 10, // Spacing between horizontal cards
    width: 200, // Fixed width for horizontal cards
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#00BFFF',
    justifyContent: 'space-between', // Push stats to bottom
  },
  myCommunityName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: 5,
  },
  myCommunityDescription: {
    fontSize: 12,
    color: '#B0B0B0',
    marginBottom: 10,
  },
  myCommunityStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto', // Push to bottom
  },
  myCommunityMembers: {
    fontSize: 12,
    color: '#B0B0B0',
    marginLeft: 5,
  },
  searchResultsContainer: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  searchResultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 15,
    marginBottom: 10,
  },
  noResultsText: {
    color: '#B0B0B0',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  communityPostsHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 15,
    paddingHorizontal: 15,
  },
  communityPostsView: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00BFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});

export default ForumsScreen;