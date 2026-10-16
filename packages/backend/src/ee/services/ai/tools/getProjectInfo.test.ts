import {
    DbtProjectType,
    ProjectType,
    toolGetProjectInfoOutputSchema,
    WarehouseTypes,
    type ToolGetProjectInfoOutput,
} from '@lightdash/common';
import { type GetProjectInfoFn } from '../types/aiAgentDependencies';
import { getGetProjectInfo } from './getProjectInfo';

const execute = (getProjectInfo: GetProjectInfoFn) =>
    getGetProjectInfo({ getProjectInfo }).execute!(
        {},
        { messages: [], toolCallId: 'test', context: {} },
    ) as Promise<ToolGetProjectInfoOutput>;

describe('getProjectInfo connection dialects', () => {
    it('returns and renders every connection without credentials', async () => {
        const connections = [
            {
                name: 'Original',
                warehouseConnectionUuid: null,
                warehouseType: WarehouseTypes.POSTGRES,
                isOriginal: true,
            },
            {
                name: 'Lake',
                warehouseConnectionUuid: 'trino-extra',
                warehouseType: WarehouseTypes.TRINO,
                isOriginal: false,
            },
        ];
        const output = await execute(async () => ({
            projectName: 'Project',
            projectType: ProjectType.DEFAULT,
            dbtConnectionType: DbtProjectType.NONE,
            dbtVersion: '1.9',
            warehouseType: WarehouseTypes.POSTGRES,
            connections,
            git: null,
            previewDeployCi: null,
        }));
        expect(toolGetProjectInfoOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.structuredContent).toMatchObject({ connections });
        expect(output.result).toContain('trino-extra');
        expect(output.result).toContain('trino');
        expect(output.result).toContain(
            'original; raw SQL tools use this connection',
        );
    });
    it('preserves the error contract', async () => {
        const output = await execute(async () => {
            throw new Error('unavailable');
        });
        expect(output.metadata.status).toBe('error');
        expect(toolGetProjectInfoOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
