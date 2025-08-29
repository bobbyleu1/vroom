import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useKeyboardInset() {
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      const k = e?.endCoordinates?.height ?? 0;
      const inset = Math.max(0, k - insets.bottom); // avoid double-counting safe area
      setKeyboardInset(inset);
      Animated.timing(anim, {
        toValue: inset,
        duration: Platform.OS === 'ios' ? e?.duration ?? 250 : 150,
        useNativeDriver: false,
      }).start();
    };
    const onHide = (e: any) => {
      setKeyboardInset(0);
      Animated.timing(anim, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e?.duration ?? 250 : 150,
        useNativeDriver: false,
      }).start();
    };

    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => { s1.remove(); s2.remove(); };
  }, [anim, insets.bottom]);

  return { keyboardInset, keyboardInsetAnim: anim };
}