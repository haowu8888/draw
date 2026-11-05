import { boardRouter, boardVersionRouter } from "./routers/board";
import { codeStackRouter } from "./routers/codeStack";
import { apiKeyRouter, commentRouter, folderRouter, priceRouter, settingRouter, userRouter } from "./routers/misc";
import { router } from "./trpc";

export const appRouter = router({
  board: boardRouter,
  boardVersion: boardVersionRouter,
  folder: folderRouter,
  comment: commentRouter,
  apiKey: apiKeyRouter,
  setting: settingRouter,
  user: userRouter,
  price: priceRouter,
  codeStack: codeStackRouter,
});

export type AppRouter = typeof appRouter;
