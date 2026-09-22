import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

// Importing the package eagerly initializes its push-token emitter, which
// reports an error in Android Expo Go even when we only use local alerts.
// Do not evaluate that module at all in Expo Go or the web preview.
export const notifications: typeof import('expo-notifications') | undefined =
  Platform.OS !== 'web' && !isRunningInExpoGo()
    ? require('expo-notifications')
    : undefined;
