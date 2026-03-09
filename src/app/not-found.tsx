import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-md mx-auto px-4">
        <FileQuestion className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Page not found
        </h2>
        <p className="text-slate-600 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/dashboard">
            <Button>Go to Dashboard</Button>
          </Link>
          <Link href="/">
            <Button variant="outline">Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
