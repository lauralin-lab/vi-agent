'use client';

import { MindMapOutput } from '@/components/output-design-system/MindMapOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function MindMapDemo() {
  const nodes = [
    { id: 'root', label: 'Project Planning', type: 'root' as const },
    { id: 'research', label: 'Research', type: 'default' as const },
    { id: 'market', label: 'Market Analysis', type: 'default' as const },
    { id: 'competitors', label: 'Competitor Research', type: 'default' as const },
    { id: 'design', label: 'Design', type: 'default' as const },
    { id: 'wireframes', label: 'Wireframes', type: 'default' as const },
    { id: 'mockups', label: 'Mockups', type: 'default' as const },
    { id: 'prototype', label: 'Prototype', type: 'default' as const },
    { id: 'development', label: 'Development', type: 'default' as const },
    { id: 'frontend', label: 'Frontend', type: 'default' as const },
    { id: 'backend', label: 'Backend', type: 'default' as const },
    { id: 'testing', label: 'Testing', type: 'default' as const },
  ];

  const edges = [
    { id: 'e1', source: 'root', target: 'research' },
    { id: 'e2', source: 'research', target: 'market' },
    { id: 'e3', source: 'research', target: 'competitors' },
    { id: 'e4', source: 'root', target: 'design' },
    { id: 'e5', source: 'design', target: 'wireframes' },
    { id: 'e6', source: 'design', target: 'mockups' },
    { id: 'e7', source: 'design', target: 'prototype' },
    { id: 'e8', source: 'root', target: 'development' },
    { id: 'e9', source: 'development', target: 'frontend' },
    { id: 'e10', source: 'development', target: 'backend' },
    { id: 'e11', source: 'development', target: 'testing' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <Link 
          href="/" 
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Mind Map Demo</h1>
        
        <div className="space-y-8">
          <MindMapOutput 
            nodes={nodes}
            edges={edges}
            title="Project Mind Map"
          />
        </div>
      </div>
    </div>
  );
}
