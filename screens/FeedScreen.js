// screens/FeedScreen.js

// The FeedScreen renders the main video feed and seamlessly inserts
// full‑screen native advertisements after every tenth video. These ads
// use the NativeAdCardFeed component, which matches the look and feel
// of a typical video post while clearly marking the content as
// sponsored. Videos autoplay as the user scrolls through the feed.

import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { supabase } from '../utils/supabase';
import VideoCard from '../components/VideoCard';
import NativeAdCardFeed from '../components/NativeAdCardFeed';
import { useNavigation } from '@react-navigation/native';

// Determine the snap interval for paging based on the full window height
const { height } = Dimensions.get('window');

// Number of video items between ads
const ADS_FREQUENCY = 10;

function FeedScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          media_url,
          content,
          like_count,
          comment_count,
          view_count,
          author_id,
          profiles (
            username,
            avatar_url
          )
        `)
        .eq('file_type', 'video')
        .order('created_at', { ascending: false });

      if (!error) {
        const videos = data || [];
        // Insert a full‑screen ad after every ADS_FREQUENCY videos
        const itemsWithAds = [];
        let adCount = 0;
        videos.forEach((video, idx) => {
          if (idx > 0 && idx % ADS_FREQUENCY === 0) {
            adCount += 1;
            itemsWithAds.push({ type: 'ad', id: `ad-${adCount}` });
          }
          itemsWithAds.push({ type: 'video', ...video });
        });
        setItems(itemsWithAds);
      } else {
        console.error('Error fetching feed videos:', error.message);
      }
      setLoading(false);
    };
    fetchVideos();
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentVideoIndex(viewableItems[0].index);
    }
  }, []);

  if (loading) {
    return (
      <ActivityIndicator
        size="large"
        color="#00BFFF"
        style={styles.loadingIndicator}
      />
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item, index) =>
        item.type === 'ad' ? item.id : item.id?.toString() ?? index.toString()
      }
      pagingEnabled
      snapToInterval={height}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
      renderItem={({ item, index }) =>
        item.type === 'ad' ? (
          <NativeAdCardFeed />
        ) : (
          <VideoCard
            item={item}
            index={index}
            currentVideoIndex={currentVideoIndex}
            navigation={navigation}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  loadingIndicator: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default FeedScreen;