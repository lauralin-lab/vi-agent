'use client';

import Link from 'next/link';
import { 
  FileText, 
  Code, 
  Image as ImageIcon, 
  Map, 
  Music, 
  Table as TableIcon,
  Play,
  ShoppingBag,
  Network,
  Volume2,
  Presentation
} from 'lucide-react';

const demos = [
  { name: 'Text Output', href: '/demos/text', icon: FileText, description: 'Display formatted text and markdown' },
  { name: 'Code Output', href: '/demos/code', icon: Code, description: 'Syntax highlighted code snippets' },
  { name: 'Image Output', href: '/demos/image', icon: ImageIcon, description: 'Image display with annotations' },
  { name: 'Map Output', href: '/demos/map', icon: Map, description: 'Interactive map with markers' },
  { name: 'Table Output', href: '/demos/table', icon: TableIcon, description: 'Structured data in tables' },
  { name: 'Mind Map', href: '/demos/mindmap', icon: Network, description: 'Hierarchical mind map visualization' },
  { name: 'Music Player', href: '/demos/music', icon: Music, description: 'Audio player with playlist' },
  { name: 'Slide Deck', href: '/demos/slides', icon: Presentation, description: 'Presentation slides' },
  { name: 'Product List', href: '/demos/products', icon: ShoppingBag, description: 'E-commerce product grid' },
  { name: 'Audio Output', href: '/demos/audio', icon: Volume2, description: 'Audio waveform and controls' },
  { name: 'Playground', href: '/demos/playground', icon: Play, description: 'Interactive code playground' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Output Components Demo
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Explore our collection of reusable output components for displaying various types of content
          </p>
        </div>

        {/* Demo Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {demos.map((demo) => {
            const Icon = demo.icon;
            return (
              <Link
                key={demo.name}
                href={demo.href}
                className="group block p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                      <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {demo.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {demo.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Click any card to view the component demo</p>
        </div>
      </div>
    </div>
  );
}
