import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Zap, Mail, MessageSquare, Bot, Shield, BarChart3 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

export default async function LandingPage() {
  await connection();
  const { userId } = await auth();
  
  if (userId) {
    // Check onboarding status before redirecting
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const user = await convex.query(api.users.getByClerkId, { clerkId: userId });
    
    if (user && !user.onboardingCompleted) {
      redirect("/onboarding/step-1");
    }
    
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <span className="text-lg font-display font-bold text-gradient">
                Wire
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/sign-in"
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl lg:text-7xl font-display font-bold text-foreground mb-6 tracking-tight leading-[1.1]">
            All your client chats.
            <br />
            <span className="text-gradient">One smart inbox.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Wire aggregates Gmail, Slack, WhatsApp, and Discord into a single
            dashboard with AI-powered priority scoring, sentiment analysis, and
            smart draft responses.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/sign-up"
              className="px-8 py-3.5 rounded-xl text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all hover:scale-[1.02] glow-primary"
            >
              Start Free
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-secondary/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-display font-bold text-center text-foreground mb-12">
            Everything you need to manage client relationships
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={<Mail className="h-5 w-5" />}
              title="Unified Inbox"
              description="See all client messages from Gmail, Slack, WhatsApp, and Discord in one place."
            />
            <FeatureCard
              icon={<Bot className="h-5 w-5" />}
              title="AI Priority Scoring"
              description="Claude AI analyzes every message and scores urgency so you never miss what matters."
            />
            <FeatureCard
              icon={<BarChart3 className="h-5 w-5" />}
              title="Relationship Health"
              description="Track sentiment trends, response times, and communication patterns per client."
            />
            <FeatureCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="Smart Draft Responses"
              description="AI generates contextual replies in your writing style. Edit and send in seconds."
            />
            <FeatureCard
              icon={<Shield className="h-5 w-5" />}
              title="Scope Creep Detection"
              description="Automatically flags when client requests go beyond the agreed project scope."
            />
            <FeatureCard
              icon={<Zap className="h-5 w-5" />}
              title="Real-Time Updates"
              description="Messages appear instantly via WebSocket. No polling, no delays."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-display font-bold text-foreground mb-12">
            Simple pricing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            <PricingCard
              name="Free"
              price="$0"
              features={[
                "1 platform",
                "5 clients",
                "Basic AI scoring",
                "7-day message history",
              ]}
            />
            <PricingCard
              name="Pro"
              price="$29"
              featured
              features={[
                "Unlimited platforms",
                "Unlimited clients",
                "All AI features",
                "Full message history",
                "Writing assistant",
              ]}
            />
            <PricingCard
              name="Agency"
              price="$79"
              features={[
                "Everything in Pro",
                "Team collaboration",
                "Shared clients",
                "Advanced analytics",
                "Priority support",
              ]}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-muted-foreground text-xs font-mono">
          &copy; {new Date().getFullYear()} Wire. Built for freelancers who
          mean business.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-hover p-6 rounded-xl">
      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mb-4 text-primary">
        {icon}
      </div>
      <h3 className="text-sm font-display font-semibold text-foreground mb-2">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  features,
  featured = false,
}: {
  name: string;
  price: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-8 transition-all ${
        featured
          ? "border-primary glow-primary relative surface-raised"
          : "border-border/40 hover:border-border"
      }`}
    >
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-mono font-bold px-3 py-1 rounded-full">
          Most Popular
        </div>
      )}
      <h3 className="text-sm font-display font-semibold text-foreground">
        {name}
      </h3>
      <div className="mt-4 mb-6">
        <span className="text-3xl font-display font-bold text-foreground">
          {price}
        </span>
        <span className="text-muted-foreground text-sm">/mo</span>
      </div>
      <ul className="space-y-2.5 mb-8">
        {features.map((feature) => (
          <li
            key={feature}
            className="text-xs text-muted-foreground flex items-center gap-2"
          >
            <span className="text-success text-sm">&#10003;</span>
            {feature}
          </li>
        ))}
      </ul>
      <Link
        href="/sign-up"
        className={`block w-full text-center py-2.5 rounded-xl text-xs font-medium transition-colors ${
          featured
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border hover:bg-accent"
        }`}
      >
        Get Started
      </Link>
    </div>
  );
}
