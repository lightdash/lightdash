import { AiAccessRefusalReason, AiAccessRefusedError } from '@lightdash/common';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { AgentContext } from '../utils/AgentContext';
import { getExportChartAsCode } from './exportChartAsCode';

describe('exportChartAsCode', () => {
    it('reports missing destinations through the tool instead of inviting inference', async () => {
        const artifacts = {
            list: vi.fn().mockResolvedValue([
                {
                    artifactUuid: 'artifact',
                    versionUuid: 'version',
                    title: 'Orders',
                    description: null,
                },
            ]),
            prepare: vi.fn(),
            prepareVersion: vi.fn(),
            prepareSqlVersion: vi.fn().mockResolvedValue(null),
        };
        const exportTool = getExportChartAsCode(
            new AgentContext([validExplore]),
            artifacts,
        );

        const output = await exportTool.execute!(
            {
                queryUuid: null,
                artifactUuid: null,
                versionUuid: null,
                slug: null,
                spaceSlug: null,
            },
            {
                messages: [],
                toolCallId: 'export',
                context: {},
            },
        );
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(JSON.parse(output.result)).toMatchObject({
            artifacts: [{ title: 'Orders' }],
            missingDestination: ['slug', 'spaceSlug'],
            instruction: expect.stringContaining('Do not infer'),
        });
        expect(artifacts.list).toHaveBeenCalledOnce();
        expect(artifacts.prepare).not.toHaveBeenCalled();
    });
});

it('preserves a chart export access refusal as structured content', async () => {
    const error = new AiAccessRefusedError(
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        {
            connectUrl: 'https://example.com/connect?entryPoint=slack_link',
        },
    );
    const exportTool = getExportChartAsCode(new AgentContext([validExplore]), {
        list: vi.fn(),
        prepare: vi.fn().mockRejectedValue(error),
        prepareVersion: vi.fn(),
        prepareSqlVersion: vi.fn().mockResolvedValue(null),
    });
    const output = await exportTool.execute!(
        {
            queryUuid: null,
            artifactUuid: 'artifact',
            versionUuid: 'version',
            slug: 'orders',
            spaceSlug: 'shared',
        },
        { messages: [], toolCallId: 'export', context: {} },
    );
    expect(output).toEqual({
        result: error.message,
        metadata: { status: 'error' },
        structuredContent: { error: error.message, refusal: error.refusal },
    });
});
