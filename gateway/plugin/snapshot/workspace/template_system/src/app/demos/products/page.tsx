'use client';

import { ProductListOutput } from '@/components/output-design-system/ProductListOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ProductsDemo() {
  const products = [
    {
      id: '1',
      name: 'Wireless Headphones',
      price: '$99.99',
      imageSrc: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300',
      description: 'Premium noise-cancelling headphones',
      url: 'https://example.com/product1',
    },
    {
      id: '2',
      name: 'Smart Watch',
      price: '$299.99',
      imageSrc: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300',
      description: 'Advanced fitness tracker',
      url: 'https://example.com/product2',
    },
    {
      id: '3',
      name: 'Laptop Stand',
      price: '$49.99',
      imageSrc: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=300',
      description: 'Ergonomic aluminum stand',
      url: 'https://example.com/product3',
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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Product List Demo</h1>
        
        <div className="space-y-8">
          <ProductListOutput 
            products={products}
            title="Featured Products"
          />
        </div>
      </div>
    </div>
  );
}
