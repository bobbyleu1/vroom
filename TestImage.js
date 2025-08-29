import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

// Test different image URLs to isolate the issue
const testUrls = [
  // Standard test image
  'https://picsum.photos/300/300',
  // Your Supabase image that's failing
  'https://rafyqmwbbagsdugwjaxx.supabase.co/storage/v1/object/public/posts/99d4f5cc-3ace-49ff-b25d-dfb7b68d0f40/1754739749324.jpg',
  // Another format test
  'https://via.placeholder.com/300x300.jpg',
];

export default function TestImage() {
  return (
    <View style={styles.container}>
      {testUrls.map((url, index) => (
        <View key={index} style={styles.testContainer}>
          <Text style={styles.text}>Test {index + 1}:</Text>
          <Image
            source={{ uri: url }}
            style={styles.image}
            onLoad={() => console.log(`Image ${index + 1} loaded successfully`)}
            onError={(error) => console.log(`Image ${index + 1} failed:`, error.nativeEvent)}
          />
          <Text style={styles.urlText} numberOfLines={2}>{url}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#000',
  },
  testContainer: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#333',
  },
  image: {
    width: 150,
    height: 150,
    backgroundColor: '#666',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  urlText: {
    color: '#ccc',
    fontSize: 10,
    marginTop: 10,
  },
});