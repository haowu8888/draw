import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "./auth";

export async function createContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({ headers: req.headers });
  return { headers: req.headers, session: session?.session ?? null, user: session?.user ?? null };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "没有权限" });
  return next();
});

export const fail = (code: TRPCError["code"], message: string) => new TRPCError({ code, message });
