import type { Group } from './types.ts';

export function groupNeedsSetup(group: Group): boolean {
  return !group.dm && (group.messages?.length ?? 0) === 0
    && (Object.hasOwn(group, 'setupCompletedAt') || Object.hasOwn(group, 'setupSkippedAt'))
    && group.setupCompletedAt == null && group.setupSkippedAt == null;
}
