/**
 * V4 Redis Channel Type Definitions
 *
 * These types define the contract between all V4 services communicating
 * over the Redis Event Bus. Every service must use these exact shapes.
 *
 * Channels:
 *   vi:ctx:{uid}       — PubSub — Context snapshot from NanoClaw
 *   vi:exec:{uid}      — PubSub — Task execution request to NanoClaw
 *   vi:stream:{uid}    — PubSub — Execution stream events from NanoClaw
 *   vi:intent:{uid}    — PubSub — Intention predictions from NanoClaw
 *   vi:actions:{uid}   — Stream — User action events (append-only log)
 *   vi:summary:{uid}   — KV     — Activity summary (TTL 5min)
 *   vi:frames:{uid}    — PubSub — Keyframe events from Realtime Agent
 *   vi:media:{uid}     — PubSub — Media capture notifications
 *   vi:events:{uid}    — PubSub — Legacy events (memory_update, session_update)
 */

// ---------------------------------------------------------------------------
// Context Snapshot (vi:ctx:{uid})
// ---------------------------------------------------------------------------

/** Published by Context Compiler every 30s */
export interface ContextSnapshot {
  version: 4;
  ts: number;
  uid: string;
  /** Compiled context string, max 2000 chars */
  snapshot: string;
  char_count: number;
  memory_version: number;
  session_active: boolean;
  latest_frame_url?: string;
  predicted_intentions: PredictedIntention[];
}

// ---------------------------------------------------------------------------
// Task Execution Request (vi:exec:{uid})
// ---------------------------------------------------------------------------

/** Published by Realtime Agent or API Server to request skill execution */
export interface ExecRequest {
  taskId: string;
  sessionId: string;
  prompt: string;
  context?: Record<string, unknown>;
  priority?: 'fast' | 'thorough';
  skillSlug?: string;
  mediaUrls?: string[];
  params?: Record<string, unknown>;
  ts: number;
}

// ---------------------------------------------------------------------------
// Stream Events (vi:stream:{uid})
// ---------------------------------------------------------------------------

export interface ExecStartEvent {
  type: 'exec_start';
  taskId: string;
  executor: string;
}

export interface ExecProgressEvent {
  type: 'exec_progress';
  taskId: string;
  step: number;
  total: number;
  message: string;
}

export interface ExecHtmlStreamEvent {
  type: 'exec_html_stream';
  taskId: string;
  chunk: string;
  done?: boolean;
}

export interface ExecTextStreamEvent {
  type: 'exec_text_stream';
  taskId: string;
  chunk: string;
  done?: boolean;
}

export interface ExecModuleEvent {
  type: 'exec_module';
  taskId: string;
  moduleType: string;
  data: unknown;
}

export interface ExecIntermediateEvent {
  type: 'exec_intermediate';
  taskId: string;
  step: number;
  label: string;
  data: unknown;
}

export interface ExecResultEvent {
  type: 'exec_result';
  taskId: string;
  summary: string;
}

export interface ExecErrorEvent {
  type: 'exec_error';
  taskId: string;
  error: string;
  recoverable: boolean;
}

export type StreamEvent =
  | ExecStartEvent
  | ExecProgressEvent
  | ExecHtmlStreamEvent
  | ExecTextStreamEvent
  | ExecModuleEvent
  | ExecIntermediateEvent
  | ExecResultEvent
  | ExecErrorEvent;

// ---------------------------------------------------------------------------
// User Action Event (vi:actions:{uid} Stream)
// ---------------------------------------------------------------------------

export interface ActionEvent {
  type: string; // voice_transcript, text_message, photo_taken, page_navigate, etc.
  ts: number;
  user_id: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Activity Summary (vi:summary:{uid} KV, TTL 5min)
// ---------------------------------------------------------------------------

export interface ActivitySummary {
  ts: number;
  period_seconds: number;
  summary: string;
  active_topics: string[];
  recent_actions: string[];
  current_page: string;
  session_active: boolean;
}

// ---------------------------------------------------------------------------
// Intention Prediction (vi:intent:{uid})
// ---------------------------------------------------------------------------

export interface IntentionUpdate {
  type: 'intention_update';
  ts: number;
  intentions: PredictedIntention[];
}

export interface PredictedIntention {
  id: string;
  skill_slug: string;
  title: string;
  description: string;
  confidence: number;
  icon: string;
  card_color?: string;
  params?: Record<string, unknown>;
  estimated_time?: string;
  estimated_cost?: string;
}

// ---------------------------------------------------------------------------
// Media Event (vi:media:{uid})
// ---------------------------------------------------------------------------

export interface MediaEvent {
  type: 'media_captured';
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnail?: string;
  duration?: number;
  dimensions: { w: number; h: number };
}

// ---------------------------------------------------------------------------
// Keyframe Event (vi:frames:{uid})
// ---------------------------------------------------------------------------

export interface KeyframeEvent {
  ts: number;
  frameUrl: string;
  sceneHash: string;
  hasChange: boolean;
}

// ---------------------------------------------------------------------------
// Skill Manifest
// ---------------------------------------------------------------------------

export interface SkillManifest {
  name: string;
  slug: string;
  icon: string;
  description: string;
  category: string;
  version: string;
  requirements?: {
    oauth?: string[];
    tools?: string[];
    input_types?: string[];
  };
  ui?: {
    card_color?: string;
    preview_template?: string;
  };
  tags?: string[];
  model?: string;
}

// ---------------------------------------------------------------------------
// Channel name helpers
// ---------------------------------------------------------------------------

export const channels = {
  ctx: (uid: string) => `vi:ctx:${uid}`,
  exec: (uid: string) => `vi:exec:${uid}`,
  stream: (uid: string) => `vi:stream:${uid}`,
  intent: (uid: string) => `vi:intent:${uid}`,
  actions: (uid: string) => `vi:actions:${uid}`,
  summary: (uid: string) => `vi:summary:${uid}`,
  frames: (uid: string) => `vi:frames:${uid}`,
  media: (uid: string) => `vi:media:${uid}`,
  events: (uid: string) => `vi:events:${uid}`,
} as const;
