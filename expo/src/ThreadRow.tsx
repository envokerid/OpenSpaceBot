import React from 'react';
import { View } from 'react-native';
import type { Task } from './core/types';
import { taskRuntime, taskTitle } from './core/threads';
import { Icon } from './Icon';
import { Label, Row, useTheme } from './ui';
export function ThreadRow({ task, selected, queued }: { task: Task; selected?: boolean; queued?: boolean }) {
 const c = useTheme(); const runtime = taskRuntime(task,queued); const folded = !!task.closedBy || task.archivedAt != null;
 const byline = task.closedBy ? `closed by ${task.closedBy.name}` : task.archivedAt != null ? 'Archived' : task.openedBy ? `opened by ${task.openedBy.name}` : '';
 const date = new Date(task.createdAt); const stamp = date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
 return <Row style={{ flexWrap: 'nowrap', gap: 12, paddingVertical: 3 }}><View style={{ flex: 1, gap: 5 }}><Label size={16} bold={task.unread} muted={folded && !runtime && !task.unread} numberOfLines={2}>{taskTitle(task)}</Label>{(runtime || task.unread) && <Row style={{ gap: 10 }}>{runtime && <Label size={12} style={{ color: runtime === 'Waiting on you' ? c.danger : runtime === 'Working' ? c.accent : c.muted }}>{runtime}</Label>}{task.unread && <Label size={12} style={{ color: c.accent }}>Unread</Label>}</Row>}<Label size={12} muted numberOfLines={1}>{[stamp,byline].filter(Boolean).join(' · ')}</Label></View>{selected && <Icon name="checkCircle" size={20} color={c.accent} />}</Row>;
}
