import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    recordCitationTelemetry,
    type CitationTelemetryArgs,
} from './citationTelemetry';

describe('recordCitationTelemetry', () => {
    const makeArgs = (
        overrides: Partial<CitationTelemetryArgs> = {},
    ): CitationTelemetryArgs => ({
        response: '',
        promptUuid: 'prompt-uuid',
        memoryEnabled: true,
        incrementMemoryCited: vi.fn(async (slugs: string[]) =>
            slugs.map((slug) => ({ memoryId: `id-${slug}`, slug })),
        ),
        onMemoryCited: vi.fn(),
        incrementContextCited: vi.fn(async (slugs: string[]) => slugs.length),
        logger: { warn: vi.fn(), error: vi.fn() },
        ...overrides,
    });

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('increments context citations when the memory setting is off', async () => {
        const args = makeArgs({
            memoryEnabled: false,
            response:
                'Revenue is net.<ld-mem-cite source="context" id="revenue-definition-3fa9c2d1" />',
        });
        await recordCitationTelemetry(args);

        expect(args.incrementContextCited).toHaveBeenCalledWith([
            'revenue-definition-3fa9c2d1',
        ]);
        expect(args.incrementMemoryCited).not.toHaveBeenCalled();
        expect(args.logger.warn).not.toHaveBeenCalled();
    });

    it('skips memory increments when memory is off, even for memory citations', async () => {
        const args = makeArgs({
            memoryEnabled: false,
            response: '<ld-mem-cite id="prefers-weekly-a1b2c3d4" />',
        });
        await recordCitationTelemetry(args);

        expect(args.incrementMemoryCited).not.toHaveBeenCalled();
        expect(args.incrementContextCited).not.toHaveBeenCalled();
    });

    it('routes each tier to its own increment', async () => {
        const args = makeArgs({
            response:
                '<ld-mem-cite id="mem-slug-a1b2c3d4" /><ld-mem-cite source="context" id="ctx-slug-3fa9c2d1" />',
        });
        await recordCitationTelemetry(args);

        expect(args.incrementMemoryCited).toHaveBeenCalledWith([
            'mem-slug-a1b2c3d4',
        ]);
        expect(args.incrementContextCited).toHaveBeenCalledWith([
            'ctx-slug-3fa9c2d1',
        ]);
        expect(args.onMemoryCited).toHaveBeenCalledWith(
            [{ memoryId: 'id-mem-slug-a1b2c3d4', slug: 'mem-slug-a1b2c3d4' }],
            { 'mem-slug-a1b2c3d4': 1 },
        );
    });

    it('skips memory telemetry silently when there is no owner', async () => {
        const args = makeArgs({
            response: '<ld-mem-cite id="mem-slug-a1b2c3d4" />',
            incrementMemoryCited: vi.fn(async () => null),
        });
        await recordCitationTelemetry(args);

        expect(args.onMemoryCited).not.toHaveBeenCalled();
        expect(args.logger.warn).not.toHaveBeenCalled();
    });

    it('warns about malformed markers and dropped slugs per tier', async () => {
        const args = makeArgs({
            response:
                '<ld-mem-cite source="wat" id="bad" /><ld-mem-cite id="unknown-mem" /><ld-mem-cite source="context" id="unknown-ctx" />',
            incrementMemoryCited: vi.fn(async () => []),
            incrementContextCited: vi.fn(async () => 0),
        });
        await recordCitationTelemetry(args);

        expect(args.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('1 malformed citation marker(s)'),
        );
        expect(args.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('1 unknown or inactive memory citation(s)'),
        );
        expect(args.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining(
                '1 unknown or inactive project-context citation(s)',
            ),
        );
    });

    it('keeps the context increment when the memory increment throws', async () => {
        const args = makeArgs({
            response:
                '<ld-mem-cite id="mem-slug-a1b2c3d4" /><ld-mem-cite source="context" id="ctx-slug-3fa9c2d1" />',
            incrementMemoryCited: vi.fn(async () => {
                throw new Error('memory down');
            }),
        });
        await recordCitationTelemetry(args);

        expect(args.incrementContextCited).toHaveBeenCalledWith([
            'ctx-slug-3fa9c2d1',
        ]);
        expect(args.logger.error).toHaveBeenCalledTimes(1);
    });
});
