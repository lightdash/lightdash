import { NotFoundError } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { getGenerateDataApp } from './generateDataApp';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const captureException = Sentry.captureException as import('vitest').Mock;

type GenerateDataAppTool = ReturnType<typeof getGenerateDataApp>;
type GenerateDataAppOutput = {
    result: string;
    metadata: {
        status: string;
        appUuid?: string;
        version?: number;
        message?: string;
    };
};

const executeGenerateDataApp = (tool: GenerateDataAppTool) =>
    tool.execute!(
        {
            prompt: 'Build a revenue app',
            template: 'dashboard',
            dashboardSlug: null,
            chartSlugs: ['revenue-by-month'],
        },
        { messages: [], toolCallId: 'tool-call-1' },
    ) as Promise<GenerateDataAppOutput>;

describe('getGenerateDataApp', () => {
    beforeEach(() => {
        captureException.mockClear();
    });

    it('forwards the args and the tool call id, returning a pending result', async () => {
        const generateDataApp = vi
            .fn()
            .mockResolvedValue({ appUuid: 'app-1', version: 1 });

        const output = await executeGenerateDataApp(
            getGenerateDataApp({ generateDataApp }),
        );

        expect(generateDataApp).toHaveBeenCalledWith({
            prompt: 'Build a revenue app',
            template: 'dashboard',
            dashboardSlug: null,
            chartSlugs: ['revenue-by-month'],
            toolCallId: 'tool-call-1',
        });
        expect(output.metadata).toEqual({
            status: 'pending',
            appUuid: 'app-1',
            version: 1,
        });
    });

    it('reports a start-time failure as an error result', async () => {
        const generateDataApp = vi
            .fn()
            .mockRejectedValue(new Error('Data apps are not enabled'));

        const output = await executeGenerateDataApp(
            getGenerateDataApp({ generateDataApp }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            appUuid: null,
            reason: 'failed',
            message: 'Data apps are not enabled',
        });
    });

    it('reports an unknown slug as an error naming it, without paging Sentry', async () => {
        const generateDataApp = vi
            .fn()
            .mockRejectedValue(
                new NotFoundError('Chart "no-such-chart" was not found'),
            );

        const output = await executeGenerateDataApp(
            getGenerateDataApp({ generateDataApp }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            appUuid: null,
            reason: 'failed',
            message: 'Chart "no-such-chart" was not found',
        });
        expect(output.result).toContain('No app was created');
        expect(captureException).not.toHaveBeenCalled();
    });
});
