// FeedScreen renders the main video feed and seamlessly inserts a native
// advertisement after every tenth video. Ads are displayed using a custom
// NativeAdCard component which makes the ad appear similar to normal content.

import React, { useEffect, useState, useCallback } from 'react';
import {
  FlatList,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { supabase } from '../utils/supabase';
import VideoCard from '../components/VideoCard';
import NativeAdCard from '../components/NativeAdCard';
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
        // Insert a placeholder ad object after every ADS_FREQUENCY videos
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
          <NativeAdCard />
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