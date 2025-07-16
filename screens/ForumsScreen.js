import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Platform, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons, Feather, AntDesign } from '@expo/vector-icons';
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


  // Render item for Hot/Trending Posts (and search results posts)
  const renderHotTrendingPostItem = ({ item }) => (
    <TouchableOpacity
      style={styles.postCard}
      onPress={() => navigation.navigate('ForumPostDetail', { postId: item.id })}
    >
      <View style={styles.voteContainer}>
        <TouchableOpacity onPress={() => console.log('Upvote')}>
          <AntDesign name="caretup" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.voteCount}>{item.upvotes}</Text>
        <TouchableOpacity onPress={() => console.log('Downvote')}>
          <AntDesign name="caretdown" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.postContent}>
        <View style={styles.postMetaTop}>
          <Text style={styles.postCommunity}>{item.community_name}</Text>
          <Text style={styles.postAuthor}>Posted by u/{item.author_username}</Text>
          <Text style={styles.postTime}>{item.created_at_formatted}</Text>
        </View>
        <Text style={styles.postTitle}>{item.title}</Text>
        <Text style={styles.postSnippet}>{item.content_snippet}</Text>
        <View style={styles.postActions}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="chatbubble-outline" size={18} color="#B0B0B0" />
            <Text style={styles.actionText}>{item.comment_count} comments</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Feather name="share" size={18} color="#B0B0B0" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Feather name="eye" size={18} color="#B0B0B0" />
            <Text style={styles.actionText}>View</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

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
                <TouchableOpacity>
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>
              {hotTrendingPosts.length > 0 ? (
                <FlatList
                  data={hotTrendingPosts}
                  renderItem={renderHotTrendingPostItem}
                  keyExtractor={(item) => item.id}
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
                  data={searchResultsPosts}
                  renderItem={renderHotTrendingPostItem}
                  keyExtractor={(item) => item.id}
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
                  data={hotTrendingPosts}
                  renderItem={renderHotTrendingPostItem}
                  keyExtractor={(item) => item.id}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000', // Dark background
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
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#00BFFF',
    overflow: 'hidden',
  },
  voteContainer: {
    width: 50,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  voteCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginVertical: 5,
  },
  postContent: {
    flex: 1,
    padding: 15,
  },
  postMetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  postCommunity: {
    fontSize: 13,
    color: '#B0B0B0',
    fontWeight: 'bold',
    marginRight: 8,
  },
  postAuthor: {
    fontSize: 13,
    color: '#888',
    marginRight: 8,
  },
  postTime: {
    fontSize: 13,
    color: '#888',
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: 5,
  },
  postSnippet: {
    fontSize: 14,
    color: '#B0B0B0',
    marginBottom: 10,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  actionText: {
    fontSize: 12,
    color: '#B0B0B0',
    marginLeft: 5,
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
});

export default ForumsScreen;
