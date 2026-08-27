import { getGenerateDataApp } from './generateDataApp';

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
            message: 'Data apps are not enabled',
        });
    });
});
