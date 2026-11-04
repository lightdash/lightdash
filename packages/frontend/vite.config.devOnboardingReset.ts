import { execFile } from 'node:child_process';
import * as path from 'path';
import { type Plugin } from 'vite';

const DEV_ONBOARDING_RESET_PATH = '/__dev/onboarding-reset';

/** Dev-server only: lets the onboarding control panel run `dev:onboarding` */
export const devOnboardingResetPlugin = (): Plugin => ({
    name: 'dev-onboarding-reset',
    apply: 'serve',
    configureServer(server) {
        server.middlewares.use(DEV_ONBOARDING_RESET_PATH, (req, res) => {
            // The custom header forces a CORS preflight, so other sites can't trigger it
            if (req.method !== 'POST' || req.headers['x-ld-dev'] !== '1') {
                res.statusCode = 405;
                res.end();
                return;
            }
            execFile(
                'pnpm',
                ['dev:onboarding', '--no-open'],
                { cwd: path.resolve(__dirname, '../..'), timeout: 120_000 },
                (error, _stdout, stderr) => {
                    res.statusCode = error ? 500 : 200;
                    res.setHeader('content-type', 'text/plain');
                    res.end(
                        error
                            ? stderr.trim().split('\n').pop() || error.message
                            : 'ok',
                    );
                },
            );
        });
    },
});
