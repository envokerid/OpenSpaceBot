import type { Bot, Task } from './types.ts';
export const taskTitle = (task: Task) => task.title.trim() || 'Untitled thread';
export function taskRuntime(task: Task, queued = false) {
 return task.activity === 'waiting-on-you' ? 'Waiting on you' : task.waitingForTeammates ? 'Waiting on teammate' : task.busy || task.activity === 'working' ? 'Working' : queued ? 'Queued' : undefined;
}
export function threadGroups(bot: Bot, selected = bot.threadId, query = '', includeClosed = false, queued: string[] = []) {
 const search = query.trim().toLowerCase();
 const tasks = (bot.tasks ?? [{ ...bot, title: '' }]).filter(t => !t.routineRunId && (includeClosed || search || (!t.closedBy && t.archivedAt == null) || t.unread || taskRuntime(t,queued.includes(t.threadId)) || t.threadId === selected));
 const rank = (t: Task) => t.activity === 'waiting-on-you' ? 0 : t.busy || t.activity === 'working' ? 1 : queued.includes(t.threadId) ? 2 : t.unread ? 3 : t.threadId === selected ? 4 : 5;
 if (!search) tasks.sort((a,b) => rank(a)-rank(b));
 const projects = [...new Map((bot.projects ?? []).map(p => [p.id,p])).values()];
 return [...projects.map(project => ({ id: project.id, project, tasks: tasks.filter(t => t.projectId === project.id) })), { id: 'unfiled', project: undefined, tasks: tasks.filter(t => !projects.some(p => p.id === t.projectId)) }].map(g => ({ ...g, tasks: !search || g.project?.name.toLowerCase().includes(search) ? g.tasks : g.tasks.filter(t => taskTitle(t).toLowerCase().includes(search)) })).filter(g => g.tasks.length);
}
