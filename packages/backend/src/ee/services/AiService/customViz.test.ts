import { Ability } from '@casl/ability';
import {
    DimensionType,
    FieldType,
    ForbiddenError,
    type ItemsMap,
    type SessionUser,
} from '@lightdash/common';
import { generateText } from 'ai';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiService } from './AiService';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(),
}));
vi.mock('../ai/models', () => ({
    getModel: () => ({ model: 'test', keyManagement: null }),
}));

const rules = (canManageExplore: boolean) =>
    canManageExplore ? [{ action: 'manage', subject: 'Explore' }] : [];

const makeUser = (canManageExplore = true) =>
    ({
        organizationUuid: 'org',
        userUuid: 'user',
        ability: new Ability(rules(canManageExplore)),
        abilityRules: rules(canManageExplore),
    }) as unknown as SessionUser;

const itemsMap = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        table: 'orders',
        tableLabel: 'Orders',
        name: 'status',
        label: 'Status',
        type: DimensionType.STRING,
        hidden: false,
    },
} as unknown as ItemsMap;

const setup = ({ ambientEnabled = true } = {}) => {
    const analytics = { track: vi.fn() };
    const service = new AiService({
        lightdashConfig: lightdashConfigMock,
        projectService: {
            getProject: vi.fn().mockResolvedValue({ organizationUuid: 'org' }),
        },
        analytics,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: ambientEnabled }),
        },
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi.fn().mockResolvedValue({ providers: {} }),
            getAccessibleModelIds: vi.fn(),
        },
    } as unknown as ConstructorParameters<typeof AiService>[0]);
    return { service, analytics };
};

const request = (user: SessionUser) => ({
    user,
    projectUuid: 'project',
    prompt: 'bar chart of orders by status',
    itemsMap,
    sampleResults: [{ orders_status: 'completed' }],
    currentVizConfig: '',
});

beforeEach(() => vi.mocked(generateText).mockReset());

describe('generateCustomViz', () => {
    it('returns the pretty-printed spec from the ambient model', async () => {
        const { service, analytics } = setup();
        vi.mocked(generateText).mockResolvedValue({
            output: { spec: '{"mark":"bar"}' },
            usage: {},
        } as never);

        const spec = await service.generateCustomViz(request(makeUser()));

        expect(spec).toBe('{\n  "mark": "bar"\n}');
        const call = vi.mocked(generateText).mock.calls[0][0];
        expect(JSON.stringify(call.messages)).toContain('orders_status');
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'ai.custom_viz.generated' }),
        );
    });

    it('returns the raw spec when the model writes invalid JSON', async () => {
        const { service } = setup();
        vi.mocked(generateText).mockResolvedValue({
            output: { spec: '{"mark": bar}' },
            usage: {},
        } as never);

        await expect(
            service.generateCustomViz(request(makeUser())),
        ).resolves.toBe('{"mark": bar}');
    });

    it('refuses users who cannot manage the explore', async () => {
        const { service } = setup();

        await expect(
            service.generateCustomViz(request(makeUser(false))),
        ).rejects.toThrow(ForbiddenError);
        expect(generateText).not.toHaveBeenCalled();
    });

    it('refuses when ambient AI is not available', async () => {
        const { service } = setup({ ambientEnabled: false });

        await expect(
            service.generateCustomViz(request(makeUser())),
        ).rejects.toThrow('Ambient AI is not available');
        expect(generateText).not.toHaveBeenCalled();
    });
});
