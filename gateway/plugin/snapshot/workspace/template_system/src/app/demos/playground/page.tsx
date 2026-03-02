'use client';

import { InteractivePlaygroundOutput } from '@/components/output-design-system/InteractivePlaygroundOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PlaygroundDemo() {
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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Interactive Playground Demo</h1>
        
        <div className="space-y-8">
          <InteractivePlaygroundOutput 
            type="custom"
            title="Code Playground"
          >
            <div className="flex items-center justify-center h-full text-gray-600 dark:text-gray-400">
              <p>Interactive playground content goes here</p>
            </div>
          </InteractivePlaygroundOutput>
        </div>
      </div>
    </div>
  );
}
