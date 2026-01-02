'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">PropPulse</h1>
          <nav className="space-x-4">
            <a href="/dashboard" className="text-gray-700 hover:text-primary font-medium">
              Dashboard
            </a>
            <a href="/research" className="text-gray-700 hover:text-primary">
              Research
            </a>
            <a href="/saved" className="text-gray-700 hover:text-primary">
              Saved Props
            </a>
            <a href="/billing" className="text-gray-700 hover:text-primary">
              Billing
            </a>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h2 className="text-3xl font-bold mb-6">What Changed Today?</h2>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <p className="text-gray-600">
            Daily feed showing injury updates, minutes spikes, and back-to-back schedules will appear here.
          </p>
          <p className="text-sm text-gray-500 mt-4">
            <strong>Note:</strong> This is the MVP. Connect your data ingestion to populate this feed.
          </p>
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-800">
            <strong>Disclaimer:</strong> PropPulse is for informational purposes only. Not betting advice. 
            Past performance does not guarantee future results.
          </p>
        </div>
      </main>
    </div>
  );
}
