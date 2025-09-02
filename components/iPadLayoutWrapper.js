// components/iPadLayoutWrapper.js

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { isTablet } from '../utils/device';

const { height, width } = Dimensions.get('window');

// Instagram-style centered phone container dimensions
const getPhoneContainerWidth = () => {
  if (isTablet) {
    // Use iPhone 15 Pro Max width (430px) or similar phone aspect ratio
    const phoneWidth = Math.min(430, height * (9/21)); // 9:21 phone aspect ratio
    return phoneWidth;
  }
  return width; // Phone: use full width
};

const getPhoneContainerHeight = () => {
  if (isTablet) {
    const phoneWidth = getPhoneContainerWidth();
    return phoneWidth * (21/9); // Phone aspect ratio 9:21
  }
  return height; // Phone: use full height
};

/**
 * IPadLayoutWrapper provides Instagram-style centered phone layout for iPad
 * while preserving full-screen layout on phones.
 * 
 * Usage:
 * <IPadLayoutWrapper>
 *   <YourScreenContent />
 * </IPadLayoutWrapper>
 */
const IPadLayoutWrapper = ({ children, style, backgroundColor = '#000' }) => {
  const containerStyle = {
    ...styles.container,
    backgroundColor,
    ...(style && style),
  };

  const phoneContainerStyle = {
    ...(isTablet && {
      width: getPhoneContainerWidth(),
      height: getPhoneContainerHeight(),
      backgroundColor,
      overflow: 'hidden',
    })
  };

  return (
    <View style={containerStyle}>
      {isTablet ? (
        // Instagram-style centered phone container for iPad
        <View style={phoneContainerStyle}>
          {children}
        </View>
      ) : (
        // Phone layout - render children directly
        children
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: width,
    height: height,
    ...(isTablet && {
      alignItems: 'center',
      justifyContent: 'center',
    })
  },
});

export default IPadLayoutWrapper;