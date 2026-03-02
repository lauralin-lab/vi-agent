'use client';

import { TableOutput } from '@/components/output-design-system/TableOutput';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TableDemo() {
  const columns = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'role', header: 'Role' },
    { accessorKey: 'status', header: 'Status' },
  ];

  const data = [
    { name: 'John Doe', email: 'john@example.com', role: 'Developer', status: 'Active' },
    { name: 'Jane Smith', email: 'jane@example.com', role: 'Designer', status: 'Active' },
    { name: 'Bob Johnson', email: 'bob@example.com', role: 'Manager', status: 'Away' },
    { name: 'Alice Williams', email: 'alice@example.com', role: 'Developer', status: 'Active' },
    { name: 'Charlie Brown', email: 'charlie@example.com', role: 'Analyst', status: 'Inactive' },
  ];

  const salesColumns = [
    { accessorKey: 'product', header: 'Product' },
    { accessorKey: 'quantity', header: 'Quantity' },
    { accessorKey: 'price', header: 'Price' },
    { accessorKey: 'total', header: 'Total' },
  ];

  const salesData = [
    { product: 'Laptop', quantity: 5, price: '$999', total: '$4,995' },
    { product: 'Mouse', quantity: 20, price: '$29', total: '$580' },
    { product: 'Keyboard', quantity: 15, price: '$79', total: '$1,185' },
    { product: 'Monitor', quantity: 8, price: '$399', total: '$3,192' },
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
        
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Table Output Demo</h1>
        
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">User Table</h2>
            <TableOutput 
              columns={columns}
              data={data}
              title="Team Members"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Sales Table</h2>
            <TableOutput 
              columns={salesColumns}
              data={salesData}
              title="Sales Report"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
