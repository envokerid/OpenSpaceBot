import { z } from 'zod';

const point = { x: z.number().int().min(0).max(32767), y: z.number().int().min(0).max(32767) };
export const mobileVmInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), ...point, button: z.enum(['left', 'right']).default('left'), count: z.number().int().min(1).max(2).default(1) }).strict(),
  z.object({ type: z.literal('drag'), ...point, toX: point.x, toY: point.y }).strict(),
  z.object({ type: z.literal('scroll'), ...point, direction: z.enum(['up', 'down', 'left', 'right']) }).strict(),
  z.object({ type: z.literal('text'), text: z.string().min(1).max(4096).refine(value => !value.includes('\0')) }).strict(),
  z.object({ type: z.literal('key'), key: z.enum(['Return', 'Tab', 'Escape', 'BackSpace', 'Delete', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'a', 'c', 'v', 'z']), modifiers: z.array(z.enum(['ctrl', 'alt', 'shift'])).max(3).default([]) }).strict(),
]);
export type MobileVmInput = z.input<typeof mobileVmInputSchema>;
export const mobileVmRequestSchema = z.object({
  action: z.enum(['take', 'renew', 'release', 'input']),
  controlLeaseId: z.string().min(16).max(120).regex(/^[A-Za-z0-9_-]+$/),
  input: mobileVmInputSchema.optional(),
}).strict().refine(value => (value.action === 'input') === (value.input !== undefined));

export function mobileVmCommand(input: z.output<typeof mobileVmInputSchema>): { tool: string; args: Record<string, unknown> } {
  const base = { scope: 'desktop', delivery_mode: 'foreground' };
  switch (input.type) {
    case 'click': return { tool: input.button === 'right' ? 'right_click' : input.count === 2 ? 'double_click' : 'click', args: { ...base, x: input.x, y: input.y } };
    case 'drag': return { tool: 'drag', args: { ...base, from_x: input.x, from_y: input.y, to_x: input.toX, to_y: input.toY } };
    case 'scroll': return { tool: 'scroll', args: { ...base, x: input.x, y: input.y, direction: input.direction, amount: 3 } };
    case 'text': return { tool: 'type_text', args: { ...base, text: input.text } };
    case 'key': return { tool: 'press_key', args: { ...base, key: input.key, modifiers: input.modifiers } };
  }
}
