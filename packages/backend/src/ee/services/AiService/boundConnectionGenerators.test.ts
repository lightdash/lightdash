import { Ability } from '@casl/ability';
import {
    DimensionType,
    TableCalculationType,
    WarehouseTypes,
    WeekDay,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { generateCustomDimension } from '../ai/agents/customDimensionGenerator';
import { generateTableCalculation } from '../ai/agents/tableCalculationGenerator';
import { AiService } from './AiService';

vi.mock('../ai/agents/customDimensionGenerator', () => ({
    generateCustomDimension: vi.fn(),
}));
vi.mock('../ai/agents/tableCalculationGenerator', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('../ai/agents/tableCalculationGenerator')
    >()),
    generateTableCalculation: vi.fn(),
}));
vi.mock('../ai/models', () => ({
    getModel: () => ({ model: 'test', keyManagement: null }),
}));

describe('AI generator connection dialect', () => {
    it.each(Object.values(WarehouseTypes))(
        'uses the bound %s dialect instead of the original',
        async (warehouseType) => {
            const getWarehouseSqlBuilderSettings = vi.fn().mockResolvedValue({
                type: warehouseType,
                startOfWeek: WeekDay.WEDNESDAY,
            });
            const service = new AiService({
                lightdashConfig: lightdashConfigMock,
                analytics: { track: vi.fn() },
                projectService: {
                    getProject: vi.fn().mockResolvedValue({
                        organizationUuid: 'org',
                        warehouseConnection: {
                            type:
                                warehouseType === WarehouseTypes.POSTGRES
                                    ? WarehouseTypes.BIGQUERY
                                    : WarehouseTypes.POSTGRES,
                        },
                    }),
                    getWarehouseSqlBuilderSettings,
                },
                featureFlagService: {
                    get: vi.fn().mockResolvedValue({ enabled: true }),
                },
                orgAiCopilotConfigResolver: {
                    getCopilotConfig: vi
                        .fn()
                        .mockResolvedValue({ providers: {} }),
                },
            } as unknown as ConstructorParameters<typeof AiService>[0]);
            const ability = new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'CustomFields' },
                { action: 'manage', subject: 'CustomSqlTableCalculations' },
            ]);
            const user: SessionUser = {
                ...defaultSessionUser,
                ability,
                abilityRules: ability.rules,
            };
            vi.mocked(generateTableCalculation).mockResolvedValue({
                sql: '1',
                displayName: 'one',
                type: TableCalculationType.NUMBER,
                format: null,
            });
            vi.mocked(generateCustomDimension).mockResolvedValue({
                sql: '1',
                displayName: 'one',
                dimensionType: DimensionType.NUMBER,
            });
            const payload = {
                prompt: 'one',
                tableName: 'orders',
                fieldsContext: [],
            };
            await service.generateTableCalculation(user, 'project', payload);
            await service.generateCustomDimension(user, 'project', payload);
            expect(getWarehouseSqlBuilderSettings).toHaveBeenCalledWith(
                'project',
                { kind: 'explore', exploreName: 'orders' },
            );
            expect(generateTableCalculation).toHaveBeenLastCalledWith(
                expect.anything(),
                expect.objectContaining({ warehouseType }),
            );
            expect(generateCustomDimension).toHaveBeenLastCalledWith(
                expect.anything(),
                expect.objectContaining({ warehouseType }),
            );
        },
    );
});
