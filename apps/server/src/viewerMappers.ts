import type { EventRow, MessageRow, ProjectRow, TaskRow, TurnUsageRow } from "@assistant/db";

/**
 * phase_2a-db-visibility.md's Forbidden-behaviors rule: a response may never
 * include a field beyond what Requirements 2–6 name. Repository functions
 * return the full Drizzle row shape; these are the one place that narrows it
 * down — explicit key-picking rather than a query-level `select()` change,
 * so the tool-facing repository functions (`listTasksForOwner`, etc.) keep
 * their existing full-row shape for every other caller.
 */

export interface ProjectView {
  projectId: string;
  title: string;
  status: ProjectRow["status"];
  taskGenerationStatus: ProjectRow["taskGenerationStatus"];
  targetDate: Date | null;
  createdAt: Date;
}

export function toProjectView(row: ProjectRow): ProjectView {
  return {
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    taskGenerationStatus: row.taskGenerationStatus,
    targetDate: row.targetDate,
    createdAt: row.createdAt,
  };
}

export interface TaskView {
  taskId: string;
  title: string;
  status: TaskRow["status"];
  deadline: Date | null;
  estimatedMinutes: number | null;
  projectId: string | null;
  createdAt: Date;
}

export function toTaskView(row: TaskRow): TaskView {
  return {
    taskId: row.taskId,
    title: row.title,
    status: row.status,
    deadline: row.deadline,
    estimatedMinutes: row.estimatedMinutes,
    projectId: row.projectId,
    createdAt: row.createdAt,
  };
}

export interface EventView {
  eventId: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  status: EventRow["status"];
  taskId: string | null;
  createdAt: Date;
}

export function toEventView(row: EventRow): EventView {
  return {
    eventId: row.eventId,
    title: row.title,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    status: row.status,
    taskId: row.taskId,
    createdAt: row.createdAt,
  };
}

export interface MessageView {
  sessionId: string;
  role: MessageRow["role"];
  content: string;
  platformMessageId: string | null;
  createdAt: Date;
}

export function toMessageView(row: MessageRow): MessageView {
  return {
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    platformMessageId: row.platformMessageId,
    createdAt: row.createdAt,
  };
}

export interface TurnUsageView {
  sessionId: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number;
  latencyMs: number;
  outcome: TurnUsageRow["outcome"];
  toolCalls: number;
  createdAt: Date;
}

export function toTurnUsageView(row: TurnUsageRow): TurnUsageView {
  return {
    sessionId: row.sessionId,
    provider: row.provider,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    latencyMs: row.latencyMs,
    outcome: row.outcome,
    toolCalls: row.toolCalls,
    createdAt: row.createdAt,
  };
}

/**
 * phase_2a-db-visibility.md's Failure and edge cases table: a `?limit=`
 * above the ceiling clamps to it; zero, negative, or non-numeric resets to
 * the default — never passed through to the query unclamped.
 */
export const VIEWER_DEFAULT_LIMIT = 100;
export const VIEWER_MAX_LIMIT = 500;

export function parseLimit(raw: unknown): number {
  if (typeof raw !== "string") {
    return VIEWER_DEFAULT_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return VIEWER_DEFAULT_LIMIT;
  }
  return Math.min(parsed, VIEWER_MAX_LIMIT);
}
