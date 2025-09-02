import { Platform } from 'react-native';

// Force phone-only behavior - treat iPad like iPhone
export const isPhone = Platform.OS === 'ios' || Platform.OS === 'android';

// Legacy support - always return false to disable tablet layouts
export const isTablet = false;