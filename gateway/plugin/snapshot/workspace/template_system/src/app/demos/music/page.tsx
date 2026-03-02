'use client';

import { MusicPlayerOutput } from '@/components/output-design-system/MusicPlayerOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function MusicDemo() {
  const track = {
    title: 'Summer Vibes',
    artist: 'The Relaxers',
    album: 'Chill Collection',
    coverArt: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300',
    duration: 225,
    src: 'https://example.com/audio.mp3',
  };

  const playlist = [
    {
      title: 'Night Drive',
      artist: 'Electric Dreams',
      duration: 252,
    },
    {
      title: 'Morning Coffee',
      artist: 'Acoustic Soul',
      duration: 178,
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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Music Player Demo</h1>
        
        <div className="space-y-8">
          <MusicPlayerOutput 
            track={track}
            playlist={playlist}
            title="My Playlist"
          />
        </div>
      </div>
    </div>
  );
}
