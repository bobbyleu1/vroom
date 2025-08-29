import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Platform } from 'react-native';

export function useHideTabBar(visible) {
  const navigation = useNavigation();
  
  useEffect(() => {
    const parent = navigation.getParent?.();
    if (!parent) return;
    
    // Preserve existing style and only toggle display
    parent.setOptions({ 
      tabBarStyle: [
        {
          backgroundColor: '#000',
          height: 70,
          borderTopWidth: 0,
          paddingBottom: Platform.OS === 'ios' ? 15 : 5,
        }, 
        { display: visible ? 'flex' : 'none' }
      ] 
    });
    
    return () => parent.setOptions({ 
      tabBarStyle: [
        {
          backgroundColor: '#000',
          height: 70,
          borderTopWidth: 0,
          paddingBottom: Platform.OS === 'ios' ? 15 : 5,
        }, 
        { display: 'flex' }
      ] 
    });
  }, [navigation, visible]);
}