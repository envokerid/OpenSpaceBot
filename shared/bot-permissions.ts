import { z } from 'zod';

/** The phone can edit this subset; elevated grants still belong to Electron. */
export const botPermissionsPatchSchema = z.object({
  chiefOfStaff: z.boolean().optional(),
  approvePeerComms: z.boolean().optional(),
  managedSections: z.array(z.string().trim().max(60)).max(100).optional(),
  acknowledgePeerScope: z.boolean().optional(),
  approvalMode: z.enum(['ask', 'edits', 'auto']).optional(),
  acknowledgeLocalAuto: z.boolean().optional(),
}).strict();

export type BotPermissionsPatch = z.infer<typeof botPermissionsPatchSchema>;
