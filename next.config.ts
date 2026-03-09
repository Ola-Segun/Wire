import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Partial Prerendering: static shell + streaming dynamic content
  // (previously experimental.ppr, now using cacheComponents)
  cacheComponents: true,
  // Optimize bundle splitting for lucide icons (tree-shake unused icons)
  modularizeImports: {
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{kebabCase member}}",
    },
  },
};

export default nextConfig;
