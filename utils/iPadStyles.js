// utils/iPadStyles.js

import { Dimensions } from 'react-native';
import { isTablet } from './device';

const { height, width } = Dimensions.get('window');

// Instagram-style centered phone container dimensions
export const getPhoneContainerWidth = () => {
  if (isTablet) {
    // Use iPhone 15 Pro Max width (430px) or similar phone aspect ratio
    const phoneWidth = Math.min(430, height * (9/21)); // 9:21 phone aspect ratio
    return phoneWidth;
  }
  return width; // Phone: use full width
};

export const getPhoneContainerHeight = () => {
  if (isTablet) {
    const phoneWidth = getPhoneContainerWidth();
    return phoneWidth * (21/9); // Phone aspect ratio 9:21
  }
  return height; // Phone: use full height
};

// Styles for iPad layout
export const getIPadStyles = (backgroundColor = '#1a1a1d') => ({
  container: {
    flex: 1,
    width: width,
    height: height,
    backgroundColor,
    ...(isTablet && {
      alignItems: 'center',
      justifyContent: 'center',
    })
  },
  phoneContainer: {
    ...(isTablet ? {
      width: getPhoneContainerWidth(),
      height: getPhoneContainerHeight(),
      backgroundColor,
      overflow: 'hidden',
      position: 'relative',
    } : {
      flex: 1
    })
  }
});

export { isTablet };