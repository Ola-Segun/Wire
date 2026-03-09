export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto p-6 animate-pulse">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-7 w-56 bg-muted rounded-lg" />
        <div className="h-4 w-72 bg-muted/60 rounded-lg mt-2" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface-raised rounded-xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-muted" />
              <div>
                <div className="h-7 w-12 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted/60 rounded mt-1" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Priority inbox skeleton */}
      <div className="surface-raised rounded-xl p-5">
        <div className="h-5 w-32 bg-muted rounded mb-5" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-muted/40 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
