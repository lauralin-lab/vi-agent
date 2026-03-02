'use client';

import { MapOutput } from '@/components/output-design-system/MapOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function MapDemo() {
  const location = {
    lat: 40.7128,
    lng: -74.0060,
    name: 'New York City',
    address: 'Manhattan, NY 10001, USA',
  };

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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Map Output Demo</h1>
        
        <div className="space-y-8">
          <MapOutput 
            location={location}
            title="Location Map"
          />
        </div>
      </div>
    </div>
  );
}
