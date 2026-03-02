'use client';

import { ImageOutput } from '@/components/output-design-system/ImageOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ImageDemo() {
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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Image Output Demo</h1>
        
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Sample Image</h2>
            <ImageOutput 
              src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800"
              alt="Mountain landscape"
              title="Beautiful Mountain View"
              caption="A stunning mountain landscape at sunset"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Another Example</h2>
            <ImageOutput 
              src="https://images.unsplash.com/photo-1511576661531-b34d7da5d0bb?w=800"
              alt="Ocean waves"
              title="Ocean Waves"
              caption="Peaceful ocean waves at the beach"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
