import { createHash } from "node:crypto";
import { join } from "node:path";

// Legacy private histories are no longer read or written. Keep their paths
// so deleting a bot or conversation also removes its old saved files.
export const roomBotHistoryDirectory = (root: string, threadId: string) =>
  join(root, createHash("sha256").update(threadId).digest("hex"));
export const roomBotHistoryFile = (root: string, threadId: string, botId: string) =>
  join(roomBotHistoryDirectory(root, threadId), `${createHash("sha256").update(JSON.stringify([threadId, botId])).digest("hex")}.json`);
