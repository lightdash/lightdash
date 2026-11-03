import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

const FEEDBACK_FILE =
    process.env.STORYBOOK_FEEDBACK_FILE ??
    path.resolve(
        process.cwd(),
        '..',
        '..',
        '.humanlayer',
        'onboarding-feedback.jsonl',
    );

const readAll = (): unknown[] => {
    if (!fs.existsSync(FEEDBACK_FILE)) return [];
    return fs
        .readFileSync(FEEDBACK_FILE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .flatMap((line) => {
            try {
                return [JSON.parse(line)];
            } catch {
                return [];
            }
        });
};

export const feedbackPlugin = (): Plugin => ({
    name: 'storybook-feedback',
    configureServer(server) {
        server.middlewares.use('/__feedback', (req, res) => {
            if (req.method === 'GET') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(readAll()));
                return;
            }
            if (req.method !== 'POST') {
                res.statusCode = 405;
                res.end();
                return;
            }
            let body = '';
            req.on('data', (chunk) => {
                body += chunk;
            });
            req.on('end', () => {
                try {
                    const entry = {
                        ...JSON.parse(body),
                        createdAt: new Date().toISOString(),
                    };
                    fs.mkdirSync(path.dirname(FEEDBACK_FILE), {
                        recursive: true,
                    });
                    fs.appendFileSync(
                        FEEDBACK_FILE,
                        `${JSON.stringify(entry)}\n`,
                    );
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(entry));
                } catch {
                    res.statusCode = 400;
                    res.end();
                }
            });
        });
    },
});
