import React from 'react';
import { View } from 'react-native';

export function UnreadLight() {
  return <View accessible accessibilityLabel="Unread message" style={{
    width: 9, height: 9, borderRadius: 5, backgroundColor: '#3B82F6',
    borderWidth: 1, borderColor: '#93C5FD',
    boxShadow: '0 0 5px 1px rgba(59, 130, 246, 0.65), 0 0 10px 2px rgba(59, 130, 246, 0.25)',
  }} />;
}
