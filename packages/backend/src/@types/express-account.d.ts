// Express.Request.account is set by accountMiddleware and consumed by
// other middlewares like winston.ts. The full augmentation lives in App.ts,
// but `ts-node` invocations that don't transitively import App.ts (e.g. the
// knex seed runner) won't see it. This ambient file mirrors the relevant
// slice so type checks pass in all entry points.
import type { Account } from '@lightdash/common';

declare global {
    namespace Express {
        interface Request {
            account?: Account;
        }
    }
}

export {};
