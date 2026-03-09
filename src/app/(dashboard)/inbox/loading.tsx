export default function InboxLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      <div className="p-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="h-6 w-16 bg-muted rounded-lg" />
            <div className="h-3 w-32 bg-muted/60 rounded mt-1" />
          </div>
          <div className="h-8 w-24 bg-muted rounded-lg" />
        </div>
        <div className="h-9 w-full bg-muted/40 rounded-xl mb-4" />
        <div className="flex gap-2 mb-4">
          <div className="h-8 w-48 bg-muted/40 rounded-lg" />
          <div className="h-8 w-36 bg-muted/40 rounded-lg" />
        </div>
      </div>
      <div className="flex-1 flex min-h-0 px-5 pb-5 gap-4">
        <div className="flex-1 surface-raised rounded-xl p-4 space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 bg-muted/30 rounded-lg" />
          ))}
        </div>
        <div className="w-120 shrink-0 max-lg:hidden surface-raised rounded-xl" />
      </div>
    </div>
  );
}
