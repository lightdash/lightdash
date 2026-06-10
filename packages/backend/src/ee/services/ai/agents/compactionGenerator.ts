import { generateText } from 'ai';
import { GeneratorModelOptions } from '../models/types';

export async function generateCompactionSummary(
    modelOptions: GeneratorModelOptions,
    {
        previousSummary,
        conversation,
    }: {
        previousSummary?: string | null;
        conversation: string;
    },
): Promise<string> {
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        messages: [
            {
                role: 'system',
                content: `You compact earlier conversation context for an analytics coding agent.

Return only markdown in this exact structure:
## Goal
## Constraints & Preferences
## Progress
### Done
### In Progress
### Blocked
## Key Decisions
## Next Steps
## Critical Context

Requirements:
- merge the previous summary with the newly provided serialized messages
- preserve user goals, decisions, important tool outputs, artifacts, pinned context, and open work
- be terse, specific, and cumulative
- do not include reasoning traces
- do not continue the conversation or answer the latest user request`,
            },
            {
                role: 'user',
                content: [
                    previousSummary
                        ? `Previous summary:\n${previousSummary}`
                        : 'Previous summary:\n(none)',
                    `Serialized conversation:\n${conversation}`,
                ].join('\n\n'),
            },
        ],
    });

    return result.text.trim();
}
