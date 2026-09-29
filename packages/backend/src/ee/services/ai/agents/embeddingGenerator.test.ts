import { embed } from 'ai';
import { registerAiUsageTracker } from '../../../../analytics/aiUsage';
import type { LightdashConfig } from '../../../../config/parseConfig';
import { generateEmbedding } from './embeddingGenerator';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    embed: vi.fn(),
}));

const configWithManagedProviders = (
    lightdashManagedProviders: string[],
): LightdashConfig =>
    ({
        ai: {
            copilot: {
                defaultProvider: 'openai',
                lightdashManagedProviders,
                providers: {
                    openai: {
                        apiKey: 'instance-key',
                        embeddingModelName: 'text-embedding-3-small',
                    },
                },
            },
        },
    }) as unknown as LightdashConfig;

describe('generateEmbedding key origin', () => {
    const track = vi.fn();

    beforeEach(() => {
        track.mockClear();
        registerAiUsageTracker(track);
        vi.mocked(embed).mockResolvedValue({
            embedding: new Array(1536).fill(0),
            usage: { tokens: 12 },
        } as never);
    });

    it('reports a Lightdash-managed key when infrastructure declares the provider', async () => {
        await generateEmbedding(
            'revenue',
            configWithManagedProviders(['openai']),
            {
                organizationUuid: 'org-1',
            },
        );

        expect(track.mock.calls[0][0].properties).toMatchObject({
            feature: 'embedding',
            keyManagement: 'lightdash-managed',
            inputTokens: 12,
        });
    });

    it('reports a self-managed key on an instance that declares no managed provider', async () => {
        await generateEmbedding('revenue', configWithManagedProviders([]), {
            organizationUuid: 'org-1',
        });

        expect(track.mock.calls[0][0].properties.keyManagement).toBe(
            'self-managed',
        );
    });
});
