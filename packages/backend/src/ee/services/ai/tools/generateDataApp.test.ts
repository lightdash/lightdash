import {
    NotFoundError,
    toolGenerateDataAppOutputSchema,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { getGenerateDataApp } from './generateDataApp';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const captureException = vi.mocked(Sentry.captureException);

type GenerateDataAppTool = ReturnType<typeof getGenerateDataApp>;

// Runs the real execute() and asserts its output parses with the tool's
// output schema on every path before handing it back typed.
const executeGenerateDataApp = async (tool: GenerateDataAppTool) => {
    if (!tool.execute) {
        throw new Error('generateDataApp tool has no execute');
    }
    const output = await tool.execute(
        {
            prompt: 'Build a revenue app',
            template: 'dashboard',
            dashboardSlug: null,
            chartSlugs: ['revenue-by-month'],
            themeSlug: null,
        },
        { messages: [], toolCallId: 'tool-call-1' },
    );
    const parsed = toolGenerateDataAppOutputSchema.safeParse(output);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
        throw parsed.error;
    }
    return parsed.data;
};

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
            themeSlug: null,
            toolCallId: 'tool-call-1',
        });
        expect(output).toEqual({
            result: 'Started the data app build. Tell the user it has started and will take a few minutes, then end your turn.',
            metadata: { status: 'pending', appUuid: 'app-1', version: 1 },
            structuredContent: {
                status: 'pending',
                appUuid: 'app-1',
                version: 1,
            },
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
        expect(output.structuredContent).toEqual({ error: output.result });
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
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(captureException).not.toHaveBeenCalled();
    });
});
