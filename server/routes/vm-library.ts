import { z } from "zod";
import { vmAccessSchema } from "../vm-library.ts";
import type { VmLibraryService } from "../vm-library-service.ts";
import { PASS, type RouteHandler } from "./table.ts";
const id = z.string().regex(/^[\w-]+$/).max(160);
const revision = z.number().int().nonnegative();
export function createVmLibraryRoutes(service: VmLibraryService, viewers?: {
  screen: (vmId: string) => Promise<unknown>;
  control: (vmId: string, action: "take" | "renew" | "release", lease: string, validate: () => void) => Promise<unknown>;
}): RouteHandler {
  return async ({ req, res, url, path, method, auth, json, readBody }) => {
    if (!/^\/api\/(vms(?:\/|$)|computer-bindings(?:\/|$))/.test(path)) return PASS;
    if (!auth.scopes.includes("admin")) return json(res, 403, { error: "VM management requires workspace settings access" });
    res.setHeader("cache-control", "no-store");
    if (method === "GET" && path === "/api/vms") return json(res, 200, await service.inventory());
    const viewer = path.match(/^\/api\/vms\/([\w-]+)\/(screen|control)$/);
    if (viewer && viewers) {
      const subject = z.object({ kind: z.enum(["bot", "group"]), id }).parse({ kind: url.searchParams.get("kind"), id: url.searchParams.get("subjectId") });
      const validate = () => {
        const vm = service.registry.get(viewer[1]);
        if (!vm) throw Object.assign(new Error("No such VM"), { status: 404 });
        service.validateSubject(subject, vm);
      };
      if (method === "GET" && viewer[2] === "screen") {
        validate();
        const result = await viewers.screen(viewer[1]);
        validate();
        return json(res, 200, result);
      }
      if (method === "POST" && viewer[2] === "control") {
        if (!/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))) return json(res, 415, { error: "content-type must be application/json" });
        const data = z.object({ action: z.enum(["take", "renew", "release"]), controlLeaseId: z.string().regex(/^[\w-]{16,120}$/) }).strict().parse(await readBody(req, 4096));
        // Exact-lease release remains possible after an owner is removed.
        if (data.action !== "release") validate();
        return json(res, 200, await viewers.control(viewer[1], data.action, data.controlLeaseId, validate));
      }
      return json(res, 405, { error: "Unsupported viewer request" });
    }
    if (!/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))) return json(res, 415, { error: "content-type must be application/json" });
    const body = await readBody(req, 65_536);
    if (method === "POST" && path === "/api/vms") {
      const data = z.object({ name: z.string().trim().min(1).max(80), access: vmAccessSchema, requestId: id, start: z.boolean().default(true) }).strict().parse(body);
      return json(res, 202, { operation: await service.create(data.name, data.access, data.requestId, data.start) });
    }
    if (method === "PATCH" && path === "/api/vms/limits") {
      const data = z.object({ revision, saved: z.number().int().min(1).max(1000), running: z.number().int().min(1).max(1000) }).strict().parse(body);
      service.registry.setLimits({ saved: data.saved, running: data.running }, data.revision);
      return json(res, 200, { ok: true });
    }
    let match = path.match(/^\/api\/vms\/([\w-]+)$/);
    if (match && method === "PATCH") {
      const { revision: expected, ...patch } = z.object({ revision, name: z.string().trim().min(1).max(80).optional(), access: vmAccessSchema.optional() }).strict().parse(body);
      service.edit(match[1], patch, expected); return json(res, 200, { ok: true });
    }
    match = path.match(/^\/api\/vms\/([\w-]+)\/actions$/);
    if (match && method === "POST") {
      const data = z.object({ revision, requestId: id, action: z.enum(["create", "start", "stop", "reconnect", "recreate", "delete"]), confirmName: z.string().optional() }).strict().parse(body);
      return json(res, 202, { operation: service.action(match[1], data.action, data.requestId, data.revision, data.confirmName) });
    }
    match = path.match(/^\/api\/computer-bindings\/(bot|group|task|default)\/([\w-]+)$/);
    if (match && method === "PUT") {
      const data = z.object({ revision, vmId: id.nullable(), grantGroupAccess: z.boolean().default(false) }).strict().parse(body);
      service.bind({ kind: match[1] as "bot" | "group" | "task" | "default", id: match[2] }, data.vmId, data.revision, data.grantGroupAccess);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "No such VM management route" });
  };
}
