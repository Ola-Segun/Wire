import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Wire — Unified Client Communication",
  description:
    "Manage all your client conversations in one place with AI-powered insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
        >
          <Suspense>
            <ClerkProvider>
              <ConvexClientProvider>
                <TooltipProvider>
                  {children}
                  <Toaster richColors position="top-right" />
                </TooltipProvider>
              </ConvexClientProvider>
            </ClerkProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
