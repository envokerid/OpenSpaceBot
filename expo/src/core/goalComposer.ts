import { goalTextFromComposer } from '../../../src/lib/composer-commands.ts';

// The editable prefix is the sole source of truth: removing it cancels Goal.
export function composerPayload(text: string, goalsAvailable: boolean) {
  const goal = goalsAvailable ? goalTextFromComposer(text) : null;
  return { text: goal ?? text, mode: goal === null ? 'chat' as const : 'goal' as const };
}

export function insertGoalCommand(text: string): string {
  return goalTextFromComposer(text) !== null ? text : `/goal ${text}`;
}

// Deleting /goal must not open a new popup and move the input under the caret.
export function suggestCommandsWhileTyping(before: string, next: string): boolean {
  return next.length > before.length && /^\/[a-z-]*$/i.test(next);
}
