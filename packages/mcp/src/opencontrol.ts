import { createAnthropic } from '@ai-sdk/anthropic';
import { create } from 'opencontrol';
import { tool } from 'opencontrol/tool';
import { z } from 'zod';

const aiProvider = createAnthropic({
    apiKey: Bun.env['ANTHROPIC_API_KEY']!,
});
const aiModel = aiProvider(Bun.env['ANTHROPIC_MODEL']!);

const app = create({
    model: aiModel,
    tools: [
        tool({
            name: 'guess_the_number',
            description: 'Guess the number from 1 to 100',
            args: z.object({
                number: z.number().min(1).max(100),
            }),
            async run(input) {
                return {
                    result: `You guessed ${input.number}`,
                };
            },
        }),
    ],
});

export default {
    port: 3000,
    fetch: app.fetch,
};
