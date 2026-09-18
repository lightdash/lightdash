import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    toolIterateDataAppOutputSchema,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { getIterateDataApp } from './iterateDataApp';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const captureException = Sentry.captureException as import('vitest').Mock;

type IterateDataAppTool = ReturnType<typeof getIterateDataApp>;

const executeIterateDataApp = async (tool: IterateDataAppTool) => {
    if (!tool.execute) {
        throw new Error('iterateDataApp tool has no execute');
    }
    const output = await tool.execute(
        {
            appSlug: 'revenue-app',
            prompt: 'Add a filter for order status',
            dashboardSlug: null,
            chartSlugs: ['orders-by-status'],
            themeSlug: null,
        },
        { messages: [], toolCallId: 'tool-call-1' },
    );
    expect(toolIterateDataAppOutputSchema.safeParse(output).success).toBe(true);
    return toolIterateDataAppOutputSchema.parse(output);
};

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
            themeSlug: null,
            toolCallId: 'tool-call-1',
        });
        expect(output.metadata).toEqual({
            status: 'pending',
            appUuid: 'app-1',
            version: 3,
        });
        expect(output.result).toContain('Started the data app build');
        expect(output.structuredContent).toEqual({
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
        expect(output.result).toContain('Data app "no-such-app" was not found');
        expect(output.structuredContent).toEqual({ error: output.result });
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
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(captureException).toHaveBeenCalledTimes(1);
    });
});
