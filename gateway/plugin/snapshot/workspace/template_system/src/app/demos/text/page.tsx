'use client';

import { TextOutput } from '@/components/output-design-system/TextOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TextDemo() {
  const sampleText = `This is a sample text output demonstrating the TextOutput component. 

It supports **markdown formatting** including:
- Bold and *italic* text
- Lists and bullet points
- [Links](https://example.com)
- Code blocks

\`\`\`javascript
function hello() {
  console.log("Hello World!");
}
\`\`\`

Perfect for displaying formatted content!`;

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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Text Output Demo</h1>
        
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Plain Text</h2>
            <TextOutput 
              content="This is a simple text output without markdown formatting."
              title="Simple Text"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Markdown Text</h2>
            <TextOutput 
              content={sampleText}
              markdown={true}
              title="Markdown Example"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Monospace Font</h2>
            <TextOutput 
              content="This text uses a monospace font, perfect for code or technical content."
              font="mono"
              title="Monospace Text"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
