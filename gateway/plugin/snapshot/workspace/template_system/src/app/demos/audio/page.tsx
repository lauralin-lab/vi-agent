'use client';

import { AudioOutput } from '@/components/output-design-system/AudioOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AudioDemo() {
  const snippets = [
    {
      id: '1',
      text: 'Welcome to our audio demo',
      duration: '0:05',
    },
    {
      id: '2',
      text: 'This is a voice snippet example',
      duration: '0:08',
    },
    {
      id: '3',
      text: 'Audio clips can be played individually',
      duration: '0:10',
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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Audio Output Demo</h1>
        
        <div className="space-y-8">
          <AudioOutput 
            snippets={snippets}
            title="Voice Snippets"
          />
        </div>
      </div>
    </div>
  );
}
