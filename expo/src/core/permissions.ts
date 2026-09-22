import { approvalModeFor, hasNativeAutoReview, supportsApprovalMode } from '../../../shared/approval-mode.ts';
import type { Bot, Instance } from './types.ts';

export const approvalLabels = { ask: 'Ask for approval', edits: 'Auto-accept edits', auto: 'Approve for me', full: 'Full access', custom: 'Custom (config.toml)' };

export function mobileApprovalSettings(bot: Pick<Bot, 'approvalMode' | 'autoApprove' | 'busy'>, instance?: Instance) {
  const saved = approvalModeFor(bot);
  const mode = instance?.driverKind === 'antigravityAgent' && saved === 'auto' ? 'ask' : saved;
  const options = (['ask', 'edits', 'auto'] as const)
    .filter(value => supportsApprovalMode(instance?.driverKind, value) && !(instance?.driverKind === 'antigravityAgent' && value === 'auto'))
    .map(id => ({ id, label: approvalLabels[id], description: id === 'ask' ? 'Requests approval for commands and file changes.' : id === 'edits' ? 'Approves file edits automatically; other actions can still require approval.' : hasNativeAutoReview(instance?.driverKind) ? "Uses the provider's automatic review to approve routine actions and ask about others." : 'This provider has no automatic review; behaves like Ask.' }));
  return { mode, options, locked: saved === 'custom' || !!bot.busy || !instance };
}
