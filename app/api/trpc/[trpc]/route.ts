import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/routers/_app";
import { AcsNotifier } from "../../../../lib/acs-notifier";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => ({ notifier: new AcsNotifier() }),
  });

export { handler as GET, handler as POST };
