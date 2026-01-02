import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, Zap, Shield } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-700 to-indigo-900">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">PropPulse</h1>
          <div className="space-x-4">
            <Link href="/auth/signin">
              <Button variant="ghost" className="text-white">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button className="bg-white text-purple-900 hover:bg-gray-100">
                Get Started
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-extrabold text-white mb-6">
            NBA Prop Research,<br />
            <span className="text-yellow-300">10x Faster</span>
          </h2>
          <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
            Stop wasting hours digging through stats. PropPulse instantly generates comprehensive prop research cards with hit rates, trends, and context.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="bg-yellow-400 text-purple-900 hover:bg-yellow-300 text-lg px-8">
                Start Free Trial <ArrowRight className="ml-2" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="lg" variant="outline" className="text-white border-white hover:bg-white/10 text-lg px-8">
                View Demo
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-20 max-w-5xl mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 text-white">
            <TrendingUp className="w-12 h-12 mb-4 text-yellow-300" />
            <h3 className="text-xl font-bold mb-2">Hit Rate Analytics</h3>
            <p className="text-purple-100">
              Instant hit rates vs any line for last 10, 20, and season. See the exact W-L-P record.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 text-white">
            <Zap className="w-12 h-12 mb-4 text-yellow-300" />
            <h3 className="text-xl font-bold mb-2">Context Insights</h3>
            <p className="text-purple-100">
              Minutes trends, injured teammates, back-to-back flags, and 3 AI-generated insights per prop.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 text-white">
            <Shield className="w-12 h-12 mb-4 text-yellow-300" />
            <h3 className="text-xl font-bold mb-2">Daily What Changed</h3>
            <p className="text-purple-100">
              Injury updates, minutes spikes, and schedule changes delivered in a personalized feed.
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-20 text-center text-purple-200 text-sm max-w-3xl mx-auto">
          <p className="border-t border-purple-400 pt-6">
            PropPulse is an analytics workflow tool, not betting advice. All data is for informational purposes only. 
            Past performance does not guarantee future results.
          </p>
        </div>
      </main>
    </div>
  );
}
