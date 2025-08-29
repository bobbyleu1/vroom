// components/RedDot.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * RedDot component for showing notification indicators
 * @param {boolean} visible - Whether to show the red dot
 * @param {number} count - Optional count to display (if > 0)
 * @param {number} size - Size of the dot (default: 8)
 * @param {object} style - Additional styles
 * @param {boolean} showCount - Whether to show count text (default: false for dots, true for badges)
 */
export default function RedDot({ 
  visible = false, 
  count = 0, 
  size = 8, 
  style = {}, 
  showCount = false 
}) {
  if (!visible) return null;

  const isCountBadge = showCount && count > 0;
  const displayCount = count > 99 ? '99+' : count.toString();

  if (isCountBadge) {
    return (
      <View style={[styles.countBadge, { minWidth: size * 2, height: size * 2 }, style]}>
        <Text style={[styles.countText, { fontSize: size * 0.6 }]}>
          {displayCount}
        </Text>
      </View>
    );
  }

  return (
    <View 
      style={[
        styles.dot, 
        { 
          width: size, 
          height: size, 
          borderRadius: size / 2 
        }, 
        style
      ]} 
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: '#FF3B30', // iOS red
    position: 'absolute',
  },
  countBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    minWidth: 16,
    height: 16,
  },
  countText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 10,
    lineHeight: 12,
  },
});

// Preset positions for common use cases
export const RedDotPositions = {
  topRight: { top: -2, right: -2 },
  topLeft: { top: -2, left: -2 },
  tabBadge: { top: -6, right: -6 },
  avatarBadge: { top: 2, right: 2 },
  iconBadge: { top: -4, right: -4 },
};