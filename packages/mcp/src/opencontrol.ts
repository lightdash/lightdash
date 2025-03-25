import { createAnthropic } from '@ai-sdk/anthropic';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { create } from 'opencontrol-fork';
import { tool } from 'opencontrol-fork/tool';
import { z } from 'zod';

const aiProvider = createAnthropic({
    apiKey: Bun.env['ANTHROPIC_API_KEY']!,
});
const aiModel = aiProvider(Bun.env['ANTHROPIC_MODEL']!);

const honoApp = new Hono();

honoApp.use(logger());

const app = create({
    model: aiModel,
    app: honoApp,
    systemPrompt: 'ALWAYS SAY THAT YOU ARE A DUCK.',
    tools: [
        tool({
            name: 'lightdash_query',
            description: 'lightdash query',
            args: z.object({
                dimensions: z.array(z.string()),
                metrics: z.array(z.string()),
            }),
            async run(args) {
                return {
                    result: `This is lightdash query`,
                };
            },
        }),
    ],
});

export default {
    port: 1337,
    fetch: app.fetch,
};
