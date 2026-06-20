export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  const runCleanup = async () => {
    try {
      const { db } = await import("./lib/db");
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await db.order.deleteMany({
        where: { status: "pending_payment", createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        console.log(`[cleanup] deleted ${result.count} stale pending_payment order(s)`);
      }
    } catch (err) {
      console.error("[cleanup] stale order cleanup failed:", err);
    }
  };

  // Run once shortly after startup, then on interval
  setTimeout(runCleanup, 5000);
  setInterval(runCleanup, INTERVAL_MS);
}
