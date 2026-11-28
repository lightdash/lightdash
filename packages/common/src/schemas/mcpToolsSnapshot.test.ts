import Ajv from 'ajv';
import mcpTools from './json/mcp-tools-1.0.json';

const createContentInput = mcpTools.tools.find(
    (tool) => tool.name === 'create_content',
)?.inputSchema;

describe('published create_content schema', () => {
    const validate = new Ajv({ strict: false }).compile(
        createContentInput ?? {},
    );
    const toSpace = {
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        type: 'composer_chart',
        content: {
            from: 'json',
            spaceSlug: 'jaffle',
            name: 'Orders',
            pipeline: {},
            chart: {},
        },
    };

    it('accepts a space save with dashboardSlug null or left out', () => {
        expect(createContentInput).toBeDefined();
        expect(validate(toSpace)).toBe(true);
        expect(
            validate({
                ...toSpace,
                content: { ...toSpace.content, dashboardSlug: null },
            }),
        ).toBe(true);
    });
});
