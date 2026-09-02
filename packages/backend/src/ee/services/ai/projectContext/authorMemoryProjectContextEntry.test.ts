import type { ProjectContextEntry } from '@lightdash/common';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import { getModel } from '../models';
import { getAiCallTelemetry } from '../utils/aiCallTelemetry';
import { authorMemoryProjectContextEntry } from './authorMemoryProjectContextEntry';

const currentEntries: ProjectContextEntry[] = [
    {
        id: 'active-users',
        kind: 'definition',
        content: 'Active users signed in during the last 28 days.',
        terms: ['active user'],
        objects: [],
    },
];

const model = getModel(lightdashConfigMock.ai.copilot, {
    useFastModel: true,
});
const telemetry = getAiCallTelemetry({
    functionId: 'memoryProjectContextEntryAuthoringTest',
    feature: 'ai-agent-memory',
    keyManagement: model.keyManagement,
});
const memory = {
    title: 'Revenue convention',
    rawMemory:
        '## Memory\nRevenue means net revenue after refunds.\n\n## Evidence\n- Query returned 12,345.67.',
};

describe('authorMemoryProjectContextEntry', () => {
    it('authors only proposal fields and keeps source metadata out of the model interface', async () => {
        const authoringLlmCall = vi.fn().mockResolvedValue({
            result: {
                type: 'proposal',
                entry: {
                    op: 'create',
                    id: null,
                    kind: 'definition',
                    content: 'Revenue means net revenue after refunds.',
                },
            },
        });

        await expect(
            authorMemoryProjectContextEntry({
                memory,
                nominationReason: 'Useful across the project',
                currentEntries,
                model,
                telemetry,
                authoringLlmCall,
            }),
        ).resolves.toEqual({
            type: 'proposal',
            entry: {
                op: 'create',
                id: null,
                kind: 'definition',
                content: 'Revenue means net revenue after refunds.',
            },
        });

        const { messages } = authoringLlmCall.mock.calls[0][0];
        expect(messages[0].content).toContain('ordered verbatim spans');
        expect(messages[0].content).toContain('do not emit them');
        expect(messages[1].content).toBe(
            JSON.stringify(
                {
                    memory,
                    nominationReason: 'Useful across the project',
                    currentProjectContextEntries: currentEntries,
                },
                null,
                2,
            ),
        );
    });

    it('does not allow the model to block a nomination', async () => {
        const authoringLlmCall = vi.fn().mockResolvedValue({
            result: {
                type: 'rejected',
                reason: 'not_project_context',
            },
        });

        await expect(
            authorMemoryProjectContextEntry({
                memory,
                nominationReason: null,
                currentEntries,
                model,
                telemetry,
                authoringLlmCall,
            }),
        ).rejects.toThrow();
    });
});
