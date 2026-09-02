import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { getIterateDataApp } from './iterateDataApp';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const captureException = Sentry.captureException as import('vitest').Mock;

type IterateDataAppTool = ReturnType<typeof getIterateDataApp>;
type IterateDataAppOutput = {
    result: string;
    metadata: {
        status: string;
        appUuid?: string | null;
        version?: number;
        message?: string;
    };
};

const executeIterateDataApp = (tool: IterateDataAppTool) =>
    tool.execute!(
        {
            appSlug: 'revenue-app',
            prompt: 'Add a filter for order status',
            dashboardSlug: null,
            chartSlugs: ['orders-by-status'],
        },
        { messages: [], toolCallId: 'tool-call-1' },
    ) as Promise<IterateDataAppOutput>;

describe('getIterateDataApp', () => {
    beforeEach(() => {
        captureException.mockClear();
    });

    it('forwards the args and the tool call id, returning a pending result', async () => {
        const iterateDataApp = vi
            .fn()
            .mockResolvedValue({ appUuid: 'app-1', version: 3 });

        const output = await executeIterateDataApp(
            getIterateDataApp({ iterateDataApp }),
        );

        expect(iterateDataApp).toHaveBeenCalledWith({
            appSlug: 'revenue-app',
            prompt: 'Add a filter for order status',
            dashboardSlug: null,
            chartSlugs: ['orders-by-status'],
            toolCallId: 'tool-call-1',
        });
        expect(output.metadata).toEqual({
            status: 'pending',
            appUuid: 'app-1',
            version: 3,
        });
    });

    it('reports an unknown app slug as an error naming it, without paging Sentry', async () => {
        const iterateDataApp = vi
            .fn()
            .mockRejectedValue(
                new NotFoundError('Data app "no-such-app" was not found'),
            );

        const output = await executeIterateDataApp(
            getIterateDataApp({ iterateDataApp }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            appUuid: null,
            reason: 'failed',
            message: 'Data app "no-such-app" was not found',
        });
        expect(output.result).toContain('No new version was created');
        expect(captureException).not.toHaveBeenCalled();
    });

    it('reports an in-progress build as an expected error, without paging Sentry', async () => {
        const iterateDataApp = vi
            .fn()
            .mockRejectedValue(
                new ParameterError(
                    'A version is already building for this app',
                ),
            );

        const output = await executeIterateDataApp(
            getIterateDataApp({ iterateDataApp }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            appUuid: null,
            reason: 'failed',
            message: 'A version is already building for this app',
        });
        expect(captureException).not.toHaveBeenCalled();
    });

    it('reports a permission refusal without paging Sentry', async () => {
        const iterateDataApp = vi
            .fn()
            .mockRejectedValue(
                new ForbiddenError(
                    'Insufficient permissions to modify data apps',
                ),
            );

        const output = await executeIterateDataApp(
            getIterateDataApp({ iterateDataApp }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            appUuid: null,
            reason: 'failed',
            message: 'Insufficient permissions to modify data apps',
        });
        expect(captureException).not.toHaveBeenCalled();
    });

    it('pages Sentry for an unexpected failure', async () => {
        const iterateDataApp = vi
            .fn()
            .mockRejectedValue(new Error('database down'));

        const output = await executeIterateDataApp(
            getIterateDataApp({ iterateDataApp }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            appUuid: null,
            reason: 'failed',
            message: 'database down',
        });
        expect(captureException).toHaveBeenCalledTimes(1);
    });
});
