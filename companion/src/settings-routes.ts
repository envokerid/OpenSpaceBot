// Workspace settings require a separate per-device host grant. Keep this
// surface explicit: granting settings access never exposes arbitrary APIs.
const routes: ReadonlyArray<{ methods: readonly string[]; path: RegExp }> = [
  { methods: ["GET", "POST"], path: /^\/api\/vms$/ },
  { methods: ["PATCH"], path: /^\/api\/vms\/(?:limits|[\w-]+)$/ },
  { methods: ["POST"], path: /^\/api\/vms\/[\w-]+\/actions$/ },
  { methods: ["PUT"], path: /^\/api\/computer-bindings\/(?:bot|group|task|default)\/[\w-]+$/ },
  { methods: ["GET", "PATCH"], path: /^\/api\/settings\/approved-commands$/ },
  { methods: ["POST"], path: /^\/api\/companion\/desktop-settings$/ },
  { methods: ["PUT", "PATCH"], path: /^\/api\/config$/ },
  { methods: ["POST"], path: /^\/api\/keys\/test$/ },
  {
    methods: ["GET"],
    path: /^\/api\/(?:usage(?:\.csv)?|fleet|cli-candidates|local-computer)$/,
  },
  { methods: ["POST"], path: /^\/api\/cli-test$/ },
  { methods: ["POST"], path: /^\/api\/instances\/claude-accounts$/ },
  { methods: ["PATCH", "DELETE"], path: /^\/api\/instances\/[\w.-]+$/ },
  { methods: ["GET"], path: /^\/api\/instances\/[\w.-]+\/auth\/status$/ },
  { methods: ["PATCH"], path: /^\/api\/instances\/[\w.-]+\/icon$/ },
  {
    methods: ["POST"],
    path: /^\/api\/instances\/[\w.-]+\/(?:refresh-models|install|auth\/(?:start|complete|cancel|sign-out)|claude-update)$/,
  },
  { methods: ["GET"], path: /^\/api\/local-computer\/instances$/ },
  {
    methods: ["POST"],
    path: /^\/api\/local-computer\/(?:pull|run|start|stop|recreate|remove)$/,
  },
  { methods: ["POST"], path: /^\/api\/bots\/[\w-]+\/local-computer\/remove$/ },
  { methods: ["GET"], path: /^\/api\/computers\/(?:boxes|vps)$/ },
  {
    methods: ["POST"],
    path: /^\/api\/computers\/(?:boxes\/[\w-]+\/(?:sleep|delete)|vps\/[\w-]+\/remove)$/,
  },
  {
    methods: ["GET", "POST", "DELETE"],
    path: /^\/api\/settings\/custom-domain$/,
  },
  { methods: ["GET", "POST"], path: /^\/api\/auth\/pairing$/ },
  { methods: ["GET"], path: /^\/api\/auth\/(?:session|sessions)$/ },
  { methods: ["DELETE"], path: /^\/api\/auth\/(?:sessions|pairing)\/[\w-]+$/ },
  {
    methods: ["GET"],
    path: /^\/api\/workspace-backup\/(?:status|download\/[\w-]+)$/,
  },
  {
    methods: ["POST"],
    path: /^\/api\/workspace-backup\/(?:export|upload|preview|restore|client-state)$/,
  },
  { methods: ["POST"], path: /^\/api\/fleet\/(?:workspaces|upgrade)$/ },
  {
    methods: ["POST"],
    path: /^\/api\/fleet\/workspaces\/[\w-]+\/(?:users|suspend|resume|upgrade)$/,
  },
  { methods: ["DELETE"], path: /^\/api\/fleet\/workspaces\/[\w-]+$/ },
];

export function isSettingsRoute(method: string, path: string): boolean {
  return routes.some(
    (route) => route.methods.includes(method) && route.path.test(path),
  );
}
