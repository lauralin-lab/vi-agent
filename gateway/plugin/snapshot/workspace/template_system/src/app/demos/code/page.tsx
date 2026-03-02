'use client';

import { CodeOutput } from '@/components/output-design-system/CodeOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function CodeDemo() {
  const pythonCode = `def fibonacci(n):
    """Calculate the nth Fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# Example usage
for i in range(10):
    print(f"F({i}) = {fibonacci(i)}")`;

  const javascriptCode = `async function fetchData(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}`;

  const htmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hello World</title>
</head>
<body>
  <h1>Welcome!</h1>
</body>
</html>`;

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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Code Output Demo</h1>
        
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Python</h2>
            <CodeOutput 
              code={pythonCode}
              language="python"
              title="Fibonacci Function"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">JavaScript</h2>
            <CodeOutput 
              code={javascriptCode}
              language="javascript"
              title="Async Fetch Example"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">HTML</h2>
            <CodeOutput 
              code={htmlCode}
              language="html"
              title="Basic HTML Page"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
