// components/PhoneViewport.tsx
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { isPad, getPhoneViewport } from '../utils/phoneViewport';

export default React.memo(function PhoneViewport({
  children,
  align = 'center' as 'center' | 'left',
}: {
  children: React.ReactNode;
  align?: 'center' | 'left';
}) {
  // Early return for phone - no extra View wrapper
  if (!isPad) return <>{children}</>;

  // Memoize viewport calculation to prevent recalculation on every render
  const { phoneWidth, phoneHeight } = useMemo(() => getPhoneViewport(), []);
  
  return (
    <View style={[styles.padRoot, align === 'left' && styles.left]}>
      <View style={[styles.box, { width: phoneWidth, height: phoneHeight }]}>
        {children}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  padRoot: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  left: { alignItems: 'flex-start', paddingLeft: 0 }, // Remove padding that causes black bar
  box: {
    backgroundColor: '#000',
    borderRadius: 20,
    overflow: 'hidden', // clip overlays to phone frame edges like iPhone
  },
});