// utils/phoneViewport.ts
import { Dimensions, Platform } from 'react-native';

// Treat any iOS device with min dimension >= 768 as iPad
export const isPad = Platform.OS === 'ios' && Math.max(
  Dimensions.get('window').width,
  Dimensions.get('window').height
) >= 768;

// iPhone viewport math: lock to 9:16 like iPhone portrait player
// On iPad, pick the same visual width as a modern iPhone (<= 430pts)
// or compute from height to preserve 9:16.
export function getPhoneViewport() {
  const { width: W, height: H } = Dimensions.get('window');

  // Use full iPad dimensions - fuck the phone frame, just fill the screen
  const phoneWidth = W;
  const phoneHeight = H;

  return { phoneWidth, phoneHeight };
}