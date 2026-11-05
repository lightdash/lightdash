import {
    PROJECT_TIMEZONE_SETTING,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';
import { generateText } from 'ai';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import { type GoogleSheetsExtensionReportDraftSettings } from '../ai/agents/googleSheetsExtensionReportDraftTypes';
import { AiService } from './AiService';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi
        .fn()
        .mockReturnValue({ input: 1, output: 1 }),
}));
vi.mock('../ai/models', () => ({
    getModel: () => ({ model: 'test', keyManagement: 'self-managed' }),
}));

const report = (limit: number): GoogleSheetsExtensionReportDraftSettings => ({
    rows: ['a_dim1'],
    columns: [],
    values: [],
    filters: [],
    sorts: [],
    limit,
    totals: { rows: false, columns: false },
    groupRows: false,
});
const request = (limit: number) => ({
    exploreName: validExplore.name,
    prompt: 'Show 20,000 rows',
    current: report(limit),
    timezone: 'UTC',
    clarifications: [],
    protectedFilters: [],
});
const response = (limit: number) =>
    ({
        output: {
            status: 'ready',
            message: 'Report ready',
            report: report(limit),
        },
        usage: {},
    }) as Awaited<ReturnType<typeof generateText>>;
const setup = (queryLimit: number | null) => {
    const get = vi.fn().mockResolvedValue({ queryLimit, csvCellsLimit: null });
    const service = new AiService({
        lightdashConfig: {
            ...lightdashConfigMock,
            query: { ...lightdashConfigMock.query, maxLimit: 100000 },
        },
        organizationSettingsModel: { get },
        projectService: {
            getProject: vi.fn().mockResolvedValue({
                organizationUuid: defaultSessionUser.organizationUuid,
            }),
            getExplore: vi.fn().mockResolvedValue(validExplore),
            getQueryTimezoneForProject: vi
                .fn()
                .mockResolvedValue('America/Los_Angeles'),
        },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi.fn().mockResolvedValue({ providers: {} }),
        },
    } as unknown as ConstructorParameters<typeof AiService>[0]);
    return { service, get };
};

beforeEach(() => vi.resetAllMocks());

it.each([null, 50000])(
    'allows 20,000-row reports with org override %s and supplies the effective maximum to AI',
    async (override) => {
        const { service, get } = setup(override);
        vi.mocked(generateText).mockResolvedValue(response(20000));
        const result = await service.generateGoogleSheetsExtensionReportDraft(
            defaultSessionUser,
            'project',
            request(20000),
        );
        expect(result.report?.limit).toBe(20000);
        expect(get).toHaveBeenCalledWith(defaultSessionUser.organizationUuid);
        const messages = vi.mocked(generateText).mock.calls[0][0].messages!;
        expect(messages[0].content).toContain(
            `limit is an integer from 1 to ${override ?? 100000}`,
        );
    },
);

it('rejects a current report over the org limit before calling AI', async () => {
    const { service } = setup(10000);
    await expect(
        service.generateGoogleSheetsExtensionReportDraft(
            defaultSessionUser,
            'project',
            request(20000),
        ),
    ).rejects.toThrow('between 1 and 10000');
    expect(generateText).not.toHaveBeenCalled();
});

it('repairs a generated report exceeding the org limit, using that same limit on the retry', async () => {
    const { service } = setup(10000);
    vi.mocked(generateText)
        .mockResolvedValueOnce(response(20000))
        .mockResolvedValueOnce(response(10000));
    const result = await service.generateGoogleSheetsExtensionReportDraft(
        defaultSessionUser,
        'project',
        request(500),
    );
    expect(result.report?.limit).toBe(10000);
    expect(generateText).toHaveBeenCalledTimes(2);
    const messages = vi.mocked(generateText).mock.calls[1][0].messages!;
    expect(messages[0].content).toContain(
        'limit is an integer from 1 to 10000',
    );
    expect(messages.at(-1)?.content).toContain('between 1 and 10000');
});

it('rejects a correction that still exceeds the org limit', async () => {
    const { service } = setup(10000);
    vi.mocked(generateText).mockResolvedValue(response(20000));
    await expect(
        service.generateGoogleSheetsExtensionReportDraft(
            defaultSessionUser,
            'project',
            request(500),
        ),
    ).rejects.toThrow('after a correction attempt');
    expect(generateText).toHaveBeenCalledTimes(2);
});

it.each([
    [
        PROJECT_TIMEZONE_SETTING,
        'Asia/Tokyo',
        'America/Los_Angeles',
        '2025-12-31',
    ],
    [USER_TIMEZONE_SETTING, 'Asia/Tokyo', 'Asia/Tokyo', '2026-01-01'],
    [USER_TIMEZONE_SETTING, null, 'America/Los_Angeles', '2025-12-31'],
    ['Europe/Paris', 'Asia/Tokyo', 'Europe/Paris', '2026-01-01'],
] as const)(
    'resolves %s with user timezone %s for the draft date context',
    async (setting, userTimezone, expectedTimezone, expectedToday) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:30:00Z'));
        try {
            const { service } = setup(null);
            vi.mocked(generateText).mockResolvedValue(response(500));
            const payload = { ...request(500), timezone: setting };
            const result =
                await service.generateGoogleSheetsExtensionReportDraft(
                    { ...defaultSessionUser, timezone: userTimezone },
                    'project',
                    payload,
                );
            expect(result.status).toBe('ready');
            const messages = vi.mocked(generateText).mock.calls[0][0].messages!;
            const context = JSON.parse(messages[1].content as string);
            expect(context).toMatchObject({
                timezone: expectedTimezone,
                today: expectedToday,
            });
            expect(payload.timezone).toBe(setting);
        } finally {
            vi.useRealTimers();
        }
    },
);
