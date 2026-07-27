import { type AppVersionStatusHistoryEntry } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { AppGenerateService } from './AppGenerateService';

// Private static — accessed via index so the filter's contract stays covered
// without widening the service's public surface.
const filter = (
    history: AppVersionStatusHistoryEntry[],
    status: 'generating' | 'ready',
    statusMessage: string | null,
) =>
    // eslint-disable-next-line @typescript-eslint/dot-notation
    AppGenerateService['filterStatusHistoryForApi'](
        history,
        status,
        statusMessage,
    );

const entry = (
    kind: AppVersionStatusHistoryEntry['kind'],
    message: string,
): AppVersionStatusHistoryEntry => ({
    kind,
    message,
    timestamp: '2026-07-27T10:00:00.000Z',
});

describe('filterStatusHistoryForApi', () => {
    it('drops reasoning entries restated in the final message on terminal versions', () => {
        const history = [
            entry('thinking', 'I will start with the KPI row.'),
            entry('tool', 'Creating App.tsx'),
            // Final text block streams through the snippet pipeline, so its
            // sentences land in the history with different whitespace.
            entry('thinking', 'Built a dashboard with a KPI row.'),
        ];
        const result = filter(
            history,
            'ready',
            'Built a dashboard\nwith a KPI row. The build step will surface issues.',
        );
        expect(result.map((e) => e.message)).toEqual([
            'I will start with the KPI row.',
            'Creating App.tsx',
        ]);
    });

    it('keeps all non-stage entries while the version is in progress', () => {
        const history = [
            entry('stage', 'Setting up build environment'),
            entry('thinking', 'Planning the layout.'),
            entry('tool', 'Reading schema.yml'),
        ];
        // Live statusMessage often equals the newest snippet — it must not
        // suppress that entry mid-build.
        const result = filter(history, 'generating', 'Planning the layout.');
        expect(result.map((e) => e.message)).toEqual([
            'Planning the layout.',
            'Reading schema.yml',
        ]);
    });
});
