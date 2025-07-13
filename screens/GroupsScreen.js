import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../utils/supabase';
import GroupFormModal from '../components/GroupFormModal';

function GroupsScreen() {
  // IMPORTANT: If you are still getting "Text strings must be rendered within a <Text> component"
  // for GroupsScreen.js at line 21 (or similar), try deleting the line below and re-typing it exactly.
  const navigation = useNavigation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Discover');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const fetchInitialData = async () => {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error("Error fetching user session:", userError.message);
          // Only show alert if there's an actual error, not just no user
          if (userError.message !== 'Auth session not found') {
            Alert.alert("Error", "Could not fetch user session: " + userError.message);
          }
          setCurrentUserId(null);
          setLoading(false);
          return;
        }

        if (user) {
          setCurrentUserId(user.id);
        } else {
          setCurrentUserId(null);
          if (activeTab === 'My Groups') {
            setGroups([]);
            setLoading(false);
            return;
          }
        }
      };
      fetchInitialData();

      // Only fetch groups once currentUserId has been properly determined (null or ID)
      // We check if it's not 'undefined' (initial state) to ensure the effect has run once
      if (currentUserId !== undefined) {
         fetchGroups();
      }

      return () => {
        // Cleanup if needed (e.g., unsubscribe from real-time listeners)
      };
    }, [currentUserId, activeTab, searchQuery])
  );

  const fetchGroups = async () => {
    setLoading(true);
    try {
      let query = supabase.from('groups').select(`
        id,
        name,
        description,
        profile_picture_url,
        banner_url,
        member_count,
        allow_text_posts,
        allow_image_posts,
        allow_video_posts,
        creator_id,
        profiles:creator_id (username, avatar_url)
      `);

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      let groupIdsFromMembership = [];
      if (currentUserId) {
        const { data: userGroupMemberships, error: membershipError } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', currentUserId);

        if (membershipError) {
          throw membershipError;
        }
        groupIdsFromMembership = userGroupMemberships.map(m => m.group_id);

        if (activeTab === 'My Groups') {
          if (groupIdsFromMembership.length === 0) {
            setGroups([]);
            setLoading(false);
            return;
          }
          query = query.in('id', groupIdsFromMembership);
        }
      } else if (activeTab === 'My Groups') {
        setGroups([]);
        setLoading(false);
        return;
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      if (data) {
        const groupsWithMembership = data.map(group => ({
          ...group,
          isMember: groupIdsFromMembership.includes(group.id),
        }));
        setGroups(groupsWithMembership);
      }
    } catch (error) {
      console.error('Error fetching groups:', error.message);
      Alert.alert('Error', 'Could not load groups: ' + error.message);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLeaveGroup = async (groupId, isCurrentlyMember) => {
    if (!currentUserId) {
      Alert.alert('Login Required', 'You must be logged in to join or leave groups.');
      return;
    }

    setLoading(true);
    try {
      if (isCurrentlyMember) {
        const { error } = await supabase
          .from('group_members')
          .delete()
          .eq('group_id', groupId)
          .eq('user_id', currentUserId);

        if (error) throw error;
        Alert.alert('Success', 'You have left the group.');
      } else {
        const { error } = await supabase
          .from('group_members')
          .insert([
            { group_id: groupId, user_id: currentUserId }
          ]);

        if (error) throw error;
        Alert.alert('Success', 'You have joined the group!');
      }
      await fetchGroups();
    } catch (error) {
      console.error('Error handling group membership:', error.message);
      Alert.alert('Error', 'Could not update group membership: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderGroupCard = ({ item }) => {
    const isCreator = currentUserId === item.creator_id;
    return (
      <TouchableOpacity
        style={styles.groupCard}
        onPress={() => navigation.navigate('GroupDetail', { groupId: item.id, groupName: item.name })}
      >
        <Image
          source={{ uri: item.banner_url || 'https://via.placeholder.com/400x150/333/888?text=Group+Banner' }}
          style={styles.bannerImage}
        />
        <View style={styles.groupCardContent}>
          <View style={styles.groupHeader}>
            <Image
              source={{ uri: item.profile_picture_url || 'https://via.placeholder.com/50/00BFFF/FFFFFF?text=GP' }}
              style={styles.profilePictureSmall}
            />
            <Text style={styles.groupName}>{item.name}</Text>
          </View>
          <Text style={styles.groupDescription}>{item.description}</Text>
          <View style={styles.groupStats}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={16} color="#B0B0B0" />
              <Text style={styles.statText}>{item.member_count || 0} members</Text>
            </View>
            {item.profiles?.username && (
              <View style={styles.statItem}>
                <Ionicons name="person" size={16} color="#B0B0B0" />
                <Text style={styles.statText}>Created by {item.profiles.username}</Text>
              </View>
            )}
          </View>
          {currentUserId && !isCreator && (
            <TouchableOpacity
              style={[
                styles.joinLeaveButton,
                item.isMember ? styles.leaveButton : styles.joinButton
              ]}
              onPress={() => handleJoinLeaveGroup(item.id, item.isMember)}
              disabled={loading}
            >
              <Text style={styles.joinLeaveButtonText}>
                {loading ? <ActivityIndicator size="small" color="#000" /> : (item.isMember ? 'Leave Group' : 'Join Group')}
              </Text>
            </TouchableOpacity>
          )}
          {isCreator && (
             <Text style={styles.creatorTag}>You are the creator</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && groups.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.loadingText}>Loading groups...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vroom</Text>
        <TouchableOpacity style={styles.createGroupButton} onPress={() => setShowCreateGroupModal(true)}>
          <Ionicons name="add" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'Discover' && styles.activeTab]}
          onPress={() => setActiveTab('Discover')}
        >
          <Ionicons name="compass" size={18} color={activeTab === 'Discover' ? '#000' : '#B0B0B0'} style={styles.tabIcon} />
          <Text style={[styles.tabText, activeTab === 'Discover' && styles.activeTabText]}>Discover</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'My Groups' && styles.activeTab]}
          onPress={() => setActiveTab('My Groups')}
        >
          <Ionicons name="people" size={18} color={activeTab === 'My Groups' ? '#000' : '#B0B0B0'} style={styles.tabIcon} />
          <Text style={[styles.tabText, activeTab === 'My Groups' && styles.activeTabText]}>My Groups</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#B0B0B0" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search groups..."
          placeholderTextColor="#B0B0B0"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={fetchGroups}
        />
      </View>

      <FlatList
        data={groups}
        renderItem={renderGroupCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContentContainer}
        style={styles.flatList}
        ListEmptyComponent={
          <View style={styles.emptyListContainer}>
            <Ionicons name="sad-outline" size={60} color="#B0B0B0" />
            <Text style={styles.emptyListText}>No groups found.</Text>
            {activeTab === 'My Groups' && (currentUserId ? <Text style={styles.emptyListSubText}>Join some groups to see them here!</Text> : <Text style={styles.emptyListSubText}>Log in to see your groups!</Text>)}
          </View>
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={showCreateGroupModal}
        onRequestClose={() => setShowCreateGroupModal(false)}
      >
        <GroupFormModal
          onClose={() => setShowCreateGroupModal(false)}
          onGroupCreated={() => {
            setShowCreateGroupModal(false);
            fetchGroups();
          }}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'android' ? 40 : 60,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  createGroupButton: {
    backgroundColor: '#00BFFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    marginHorizontal: 15,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#00BFFF',
  },
  tabText: {
    color: '#B0B0B0',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 5,
  },
  activeTabText: {
    color: '#000',
  },
  tabIcon: {
    marginRight: 5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    marginHorizontal: 15,
    marginBottom: 20,
    paddingHorizontal: 15,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 12,
  },
  flatList: {
    flex: 1,
  },
  listContentContainer: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  groupCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    marginBottom: 15,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  groupCardContent: {
    padding: 15,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  profilePictureSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#00BFFF',
    marginRight: 10,
  },
  groupName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  groupDescription: {
    color: '#B0B0B0',
    fontSize: 14,
    marginBottom: 10,
  },
  groupStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
  },
  statText: {
    color: '#B0B0B0',
    fontSize: 13,
    marginLeft: 5,
  },
  joinLeaveButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  joinButton: {
    backgroundColor: '#00BFFF',
  },
  leaveButton: {
    backgroundColor: '#FF6347',
  },
  joinLeaveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  creatorTag: {
    color: '#B0B0B0',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyListContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyListText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  emptyListSubText: {
    color: '#B0B0B0',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
  },
});

export default GroupsScreen;