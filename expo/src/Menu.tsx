import React, { useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useTheme } from './ui';
export function Menu({ x, y, children, onClose, width = 280, borderRadius = 4 }: React.PropsWithChildren<{ x: number; y: number; onClose: () => void; width?: number; borderRadius?: number }>) {
 const c = useTheme(); const viewport = useWindowDimensions(); const [height,setHeight] = useState(240);
 return <Modal transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}><Pressable onPress={onClose} style={{ flex: 1 }}><View onLayout={e => setHeight(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: Math.max(8,Math.min(x,viewport.width-width-8)), top: Math.max(32,Math.min(y,viewport.height-height-32)), width: Math.min(width,viewport.width-16), borderRadius, backgroundColor: c.card, elevation: 8, paddingVertical: 8 }}>{children}</View></Pressable></Modal>;
}
