'use client';

import { SlideDeckOutput } from '@/components/output-design-system/SlideDeckOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function SlidesDemo() {
  const slides = [
    {
      type: 'text' as const,
      title: 'Welcome',
      content: 'This is a presentation demo showcasing slide deck output component.',
    },
    {
      type: 'image' as const,
      title: 'Beautiful Landscape',
      src: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    },
    {
      type: 'text' as const,
      title: 'Features',
      content: '• Easy to use\n• Responsive design\n• Multiple slide types',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <Link 
          href="/" 
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Slide Deck Demo</h1>
        
        <div className="space-y-8">
          <SlideDeckOutput 
            slides={slides}
            title="My Presentation"
          />
        </div>
      </div>
    </div>
  );
}
