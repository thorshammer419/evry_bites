import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Notifier } from "../lib/notifier";

export interface TRPCContext {
  notifier: Notifier;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
