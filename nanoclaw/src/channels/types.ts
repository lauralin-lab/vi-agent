/**
 * V5 Redis Channel Type Definitions
 *
 * These types define the contract between all services communicating
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
  version: 5;
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
  /** User identity — flows through the message so NanoClaw doesn't need a fixed USER_ID. */
  userId?: string;
}

// ---------------------------------------------------------------------------
// Card Template Protocol — Card Operations (vi:stream:{uid})
// ---------------------------------------------------------------------------

/** Card position in the canvas */
export type CardPosition = 'append' | 'prepend' | `after:${string}`;

/** Card category from Cognitive Function Taxonomy */
export type CardCategory = 'perceive' | 'think' | 'act' | 'interact' | 'present';

/** Template renderer type */
export type RendererType = 'html' | 'react';

// --- Card Operations (System V5 Protocol §5.2) ---

/** Create a new card in the canvas */
export interface CreateCardOp {
  op: 'create_card';
  taskId: string;
  cardId: string;
  template: string;
  data: Record<string, unknown>;
  position?: CardPosition;
  timestamp?: string;
}

/** Stream data into an existing card's slot (progressive loading) */
export interface StreamToCardOp {
  op: 'stream_to_card';
  taskId: string;
  cardId: string;
  slot: string;
  chunk: string;
  timestamp?: string;
}

/** Mutate specific slots in a living card (dot-notation paths) */
export interface UpdateCardOp {
  op: 'update_card';
  taskId: string;
  cardId: string;
  updates: Record<string, unknown>;
  timestamp?: string;
}

/** Add items to an array slot */
export interface AppendToCardOp {
  op: 'append_to_card';
  taskId: string;
  cardId: string;
  slot: string;
  items: unknown[];
  timestamp?: string;
}

/** Replace a card's template entirely (e.g., thinking → result) */
export interface ReplaceCardOp {
  op: 'replace_card';
  taskId: string;
  cardId: string;
  template: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

/** Mark a card as complete (no more mutations) */
export interface FinalizeCardOp {
  op: 'finalize_card';
  taskId: string;
  cardId: string;
  timestamp?: string;
}

/** Remove a card from the canvas */
export interface RemoveCardOp {
  op: 'remove_card';
  taskId: string;
  cardId: string;
  reason?: string;
  timestamp?: string;
}

/** Freeform HTML escape hatch (backward compat with PersistentHtmlRenderer) */
export interface HtmlStreamOp {
  op: 'html_stream';
  taskId: string;
  cardId: string;
  chunk: string;
  done?: boolean;
  timestamp?: string;
}

/** Union of all card operations */
export type CardOp =
  | CreateCardOp
  | StreamToCardOp
  | UpdateCardOp
  | AppendToCardOp
  | ReplaceCardOp
  | FinalizeCardOp
  | RemoveCardOp
  | HtmlStreamOp;

// --- Card Actions (upstream: user → NanoClaw via vi:actions:{uid}) ---

/** User interaction with a card */
export interface CardActionEvent {
  op: 'card_action';
  cardId: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp?: string;
}

/** Common card action types */
export type CardActionType =
  | 'item_checked'
  | 'option_selected'
  | 'rating_set'
  | 'form_submitted'
  | 'marker_tapped'
  | 'slide_changed'
  | 'draw_complete'
  | 'add_to_calendar'
  | 'download_file'
  | 'card_dismissed'
  | 'message_sent';

// --- Session-level events (task lifecycle) ---

export interface ExecStartEvent {
  type: 'exec_start';
  taskId: string;
  executor: string;
  prompt?: string;
  mediaUrls?: string[];
}

export interface ExecProgressEvent {
  type: 'exec_progress';
  taskId: string;
  step: number;
  total: number;
  message: string;
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

/** All events that flow over vi:stream:{uid} */
export type StreamEvent =
  | CardOp
  | ExecStartEvent
  | ExecProgressEvent
  | ExecResultEvent
  | ExecErrorEvent;

// ---------------------------------------------------------------------------
// Card Persistence — Event Log + Final State (§7)
// ---------------------------------------------------------------------------

/** A recorded card event for session replay */
export interface CardEventLogEntry {
  index: number;
  op: CardOp;
  timestamp: string;
}

/** Final state of a card at session end */
export interface CardFinalState {
  cardId: string;
  template: string;
  data: Record<string, unknown>;
  status: 'finalized' | 'streaming' | 'removed';
}

/** Complete session card state for persistence */
export interface SessionCardState {
  sessionId: string;
  cardEvents: CardEventLogEntry[];
  finalState: Record<string, CardFinalState>;
  media: string[];
}

// ---------------------------------------------------------------------------
// Template Schema (§3)
// ---------------------------------------------------------------------------

/** Template slot definition */
export interface TemplateSlot {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  streamable?: boolean;
  mutable?: boolean;
  items?: TemplateSlot | { type: string; properties?: Record<string, TemplateSlot> };
  properties?: Record<string, TemplateSlot>;
  enum?: string[];
  min?: number;
  max?: number;
  format?: string;
}

/** Template definition from JSON schema */
export interface TemplateDefinition {
  $id: string;
  category: CardCategory;
  renderer: RendererType;
  component?: string;
  mutable: boolean;
  streamable: boolean;
  description?: string;
  source?: string;
  slots: Record<string, TemplateSlot>;
  mutable_slots?: string[];
  streamable_slots?: string[];
}

/** Compiled template registry (built at startup) */
export interface TemplateRegistry {
  version: string;
  templates: Record<string, TemplateRegistryEntry>;
}

export interface TemplateRegistryEntry {
  category: CardCategory;
  renderer: RendererType;
  component?: string;
  source: string;
  mutable: boolean;
  streamable: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// Experience Package Manifest (§2.3)
// ---------------------------------------------------------------------------

export interface PackageManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  icon: string;
  category: string;

  trigger: {
    visual_cues: string[];
    voice_keywords: string[];
    intention_level: string;
  };

  skill: {
    prompt: string;
    model: string;
    max_turns: number;
    max_tokens: number;
  };

  templates: {
    bundled: string[];
    shared: string[];
  };

  tools: {
    bundled: string[];
    builtin: string[];
  };

  apis: Record<string, {
    required: boolean;
    oauth_provider?: string;
    scopes?: string[];
    connection_prompt?: string;
  }>;

  output: {
    card_sequence: string[];
    estimated_time: string;
    estimated_cost: string;
  };
}

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
  skill_slug?: string | null;
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
  /** Thinking card configuration — dynamic title + business-semantic steps */
  thinking?: {
    title?: string;
    steps?: { label: string; content?: string }[];
  };
  /** Output card configuration — preferred template + auto-publish behavior */
  output?: {
    template?: string;
    auto_publish?: boolean;
  };
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
  /** Task queue for competing consumers (V5 process pool) */
  queue: 'vi:queue' as const,
  /** Distributed lock for cron jobs */
  cron: (uid: string, jobId: string) => `vi:cron:${uid}:${jobId}`,
  /** Active user set for event aggregation */
  activeUsers: 'vi:active_users' as const,
  activeUser: (uid: string) => `vi:active_user:${uid}`,
} as const;

