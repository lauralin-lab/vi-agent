/**
 * ModuleRenderer — dispatches module_type to specific React component.
 *
 * Receives { module_type, data } from NanoClaw execution and renders the
 * appropriate native module component with error boundary protection.
 */

import { Component, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ModuleErrorFallback } from './shared';

// Lazy-load module components for code splitting
const PlaceCardModule = lazy(() => import('./PlaceCardModule'));
const ChecklistModule = lazy(() => import('./ChecklistModule'));
const WeatherModule = lazy(() => import('./WeatherModule'));
const ComparisonModule = lazy(() => import('./ComparisonModule'));
const RecipeModule = lazy(() => import('./RecipeModule'));
const StepsGuideModule = lazy(() => import('./StepsGuideModule'));
const InfoCardModule = lazy(() => import('./InfoCardModule'));
const ImageGalleryModule = lazy(() => import('./ImageGalleryModule'));
const NutritionCardModule = lazy(() => import('./NutritionCardModule'));
const ShoppingListModule = lazy(() => import('./ShoppingListModule'));
const MapPinsModule = lazy(() => import('./MapPinsModule'));
const QuizModule = lazy(() => import('./QuizModule'));
const ConversationModule = lazy(() => import('./ConversationModule'));

const MODULE_MAP = {
  // Legacy module type names (snake_case)
  place_card: PlaceCardModule,
  checklist: ChecklistModule,
  weather: WeatherModule,
  comparison: ComparisonModule,
  recipe: RecipeModule,
  steps_guide: StepsGuideModule,
  info_card: InfoCardModule,
  image_gallery: ImageGalleryModule,
  nutrition_card: NutritionCardModule,
  shopping_list: ShoppingListModule,
  map_pins: MapPinsModule,
  quiz: QuizModule,
  conversation: ConversationModule,
  // V5 Card Template Protocol names (kebab-case)
  'map-pins': MapPinsModule,
  'shopping-list': ShoppingListModule,
  'nutrition-card': NutritionCardModule,
  'comparison-table': ComparisonModule,
  'thinking-process': StepsGuideModule,
  'image-analysis': InfoCardModule,
  'calendar-event': InfoCardModule,
  'hero-image': InfoCardModule,
  'image-gallery': ImageGalleryModule,
};

// Error boundary per module — prevents one broken module from crashing the view
class ModuleErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(`[ModuleRenderer] ${this.props.module_type} crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ModuleErrorFallback
          module_type={this.props.module_type}
          data={this.props.data}
        />
      );
    }
    return this.props.children;
  }
}

// Loading fallback for lazy-loaded modules
function ModuleLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={20} className="text-white/20 animate-spin" />
    </div>
  );
}

export default function ModuleRenderer({ module_type, data, onAction }) {
  const ModuleComponent = MODULE_MAP[module_type];

  if (!ModuleComponent) {
    return <ModuleErrorFallback module_type={module_type} data={data} />;
  }

  return (
    <ModuleErrorBoundary module_type={module_type} data={data}>
      <Suspense fallback={<ModuleLoadingFallback />}>
        <ModuleComponent data={data} onAction={onAction} />
      </Suspense>
    </ModuleErrorBoundary>
  );
}

/** Extract a title from module data for CanvasCard header. */
export function extractModuleTitle(module_type, data) {
  if (!data) return module_type;

  // Most modules have a direct title field
  if (data.title) return data.title;
  if (data.name) return data.name;
  if (data.location) return data.location;

  // Fallback: humanize the module_type (snake_case legacy + kebab-case V5)
  const names = {
    place_card: 'Place',
    checklist: 'Checklist',
    weather: 'Weather',
    comparison: 'Comparison',
    recipe: 'Recipe',
    steps_guide: 'Guide',
    info_card: 'Info',
    image_gallery: 'Gallery',
    nutrition_card: 'Nutrition',
    shopping_list: 'Shopping List',
    map_pins: 'Locations',
    quiz: 'Quiz',
    conversation: 'Conversation',
    'map-pins': 'Locations',
    'shopping-list': 'Shopping List',
    'nutrition-card': 'Nutrition',
    'comparison-table': 'Comparison',
    'thinking-process': 'Thinking',
    'image-analysis': 'Analysis',
    'calendar-event': 'Calendar',
    'hero-image': 'Hero',
    'image-gallery': 'Gallery',
    'freeform-html': 'Content',
  };
  return names[module_type] || module_type;
}
