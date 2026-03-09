export default function ClientDetailLoading() {
  return (
    <div className="max-w-6xl mx-auto p-6 animate-pulse">
      <div className="h-4 w-28 bg-muted rounded mb-5" />
      <div className="flex items-start gap-5 mb-8">
        <div className="w-16 h-16 rounded-xl bg-muted" />
        <div>
          <div className="h-7 w-40 bg-muted rounded-lg" />
          <div className="h-4 w-24 bg-muted/60 rounded mt-1" />
          <div className="flex gap-2 mt-3">
            <div className="h-6 w-28 bg-muted/40 rounded-full" />
            <div className="h-6 w-24 bg-muted/40 rounded-full" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="surface-raised rounded-xl p-5 h-40" />
          <div className="surface-raised rounded-xl p-5 h-60" />
        </div>
        <div className="lg:col-span-2">
          <div className="surface-raised rounded-xl p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-muted/30 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
