/**
 * TemplateEngine — template registry and resolver for the Card Template Protocol.
 *
 * Maintains a static registry of all bundled templates. Given a template ID,
 * returns the renderer type (html or react) and component/template path.
 */

// Template registry — all core templates + freeform-html fallback
const TEMPLATE_REGISTRY = {
  'thinking-process': {
    category: 'think',
    renderer: 'html',
    mutable: true,
    streamable: true,
    description: 'Step-by-step reasoning visualization',
  },
  'image-analysis': {
    category: 'perceive',
    renderer: 'html',
    mutable: false,
    streamable: true,
    description: 'Image analysis with detected objects and tags',
  },
  'calendar-event': {
    category: 'act',
    renderer: 'html',
    mutable: true,
    streamable: false,
    description: 'Calendar event card with attendees',
  },
  'comparison-table': {
    category: 'think',
    renderer: 'html',
    mutable: false,
    streamable: true,
    description: 'Side-by-side feature comparison table',
  },
  'hero-image': {
    category: 'present',
    renderer: 'html',
    mutable: false,
    streamable: true,
    description: 'Full-width hero image with overlay text',
  },
  'nutrition-card': {
    category: 'perceive',
    renderer: 'react',
    component: 'NutritionCardModule',
    mutable: false,
    streamable: true,
    description: 'Nutrition facts with macro chart',
  },
  'shopping-list': {
    category: 'act',
    renderer: 'react',
    component: 'ShoppingListModule',
    mutable: true,
    streamable: true,
    description: 'Interactive shopping list with categories',
  },
  'map-pins': {
    category: 'act',
    renderer: 'react',
    component: 'MapPinsModule',
    mutable: true,
    streamable: false,
    description: 'Location markers with ratings',
  },
  checklist: {
    category: 'act',
    renderer: 'react',
    component: 'ChecklistModule',
    mutable: true,
    streamable: true,
    description: 'Interactive checklist with progress tracking',
  },
  quiz: {
    category: 'interact',
    renderer: 'react',
    component: 'QuizModule',
    mutable: true,
    streamable: false,
    description: 'Interactive quiz with reveal',
  },
  conversation: {
    category: 'interact',
    renderer: 'react',
    component: 'ConversationModule',
    mutable: true,
    streamable: true,
    description: 'Threaded conversation view',
  },
  'image-gallery': {
    category: 'present',
    renderer: 'react',
    component: 'ImageGalleryModule',
    mutable: false,
    streamable: true,
    description: 'Swipeable image gallery with captions',
  },
  thinking: {
    category: 'present',
    renderer: 'react',
    component: 'StepsGuideModule',
    mutable: false,
    streamable: true,
    description: 'Thinking/processing indicator card',
  },
  'text-result': {
    category: 'present',
    renderer: 'react',
    component: 'TextResultModule',
    mutable: false,
    streamable: false,
    description: 'Plain text/markdown result card',
  },
  'freeform-html': {
    category: 'present',
    renderer: 'html',
    mutable: false,
    streamable: true,
    description: 'Freeform HTML content (fallback)',
  },
};

/**
 * Resolve a template ID to its registry entry.
 * Falls back to freeform-html if template is unknown.
 */
export function resolveTemplate(templateId) {
  return TEMPLATE_REGISTRY[templateId] || TEMPLATE_REGISTRY['freeform-html'];
}



