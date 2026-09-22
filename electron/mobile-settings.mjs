// Only these existing desktop handlers may be called by a phone with an
// explicit settings grant. No arbitrary IPC channel or sender is accepted.
export const MOBILE_SETTINGS_CHANNELS = new Set([
  "update:get-state",
  "update:check",
  "update:download",
  "update:install",
  "organization:state",
  "organization:begin",
  "organization:cancel",
  "organization:refresh",
  "organization:disconnect",
  "company-backups:state",
  "company-backups:list",
  "company-backups:create",
  "company-backups:configure-schedule",
  "company-backups:preview",
  "company-backups:restore",
  "company-backups:delete",
  "company-backups:cancel",
  "companion:state",
  "companion:stop",
  "companion:keep-awake",
  "companion:refresh-tailscale",
  "companion:pairing",
  "companion:revoke",
  "companion:cloud-desktop",
  "companion:settings-access",
  "companion-account:state",
  "companion-account:request-code",
  "companion-account:verify-code",
  "companion-account:retry",
  "companion-account:sign-out",
]);
export function createMobileSettingsRegistry() {
  const handlers = new Map();
  return {
    register(channel, handler) {
      if (MOBILE_SETTINGS_CHANNELS.has(channel)) handlers.set(channel, handler);
    },
    async invoke(channel, args) {
      const handler = handlers.get(channel);
      if (!MOBILE_SETTINGS_CHANNELS.has(channel) || !handler)
        throw new Error(
          "This desktop setting is not available on this computer.",
        );
      if (!Array.isArray(args) || args.length > 3)
        throw new Error("Invalid settings request.");
      return handler(undefined, ...args);
    },
  };
}
