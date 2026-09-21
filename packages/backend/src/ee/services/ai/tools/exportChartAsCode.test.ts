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
        };
        const exportTool = getExportChartAsCode(artifacts);

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
                experimental_context: new AgentContext([validExplore]),
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
