import {
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    SearchResults,
    SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { OmnibarSearchTimingSnapshot } from '../../logging/omnibarSearchTiming';
import { SearchService } from './SearchService';

const projectUuid = 'privacy-project-canary';
const organizationUuid = 'privacy-organization-canary';
const userUuid = 'privacy-user-canary';
const query = 'privacy-query-canary';
const malformedTypeFilter = 'privacy-filter-canary';

const user = {
    userUuid,
    abilityRules: [],
    ability: defineUserAbility(
        {
            role: OrganizationMemberRole.ADMIN,
            organizationUuid,
            userUuid,
            roleUuid: undefined,
        },
        [],
    ),
} as unknown as SessionUser;

const emptyResults: SearchResults = {
    spaces: [],
    dashboards: [],
    savedCharts: [],
    sqlCharts: [],
    tables: [],
    fields: [],
    pages: [],
    dashboardTabs: [],
    dataApps: [],
    documents: [],
};

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, reject, resolve };
};

type SearchOperation = (
    projectUuid: string,
    query: string,
    filters?: unknown,
    timing?: unknown,
) => Promise<SearchResults>;

const makeService = ({
    appGenerateService,
    search,
    results = emptyResults,
    userAttributes = {},
}: {
    appGenerateService?: {
        dataAppsEnabledFor: ReturnType<typeof vi.fn>;
        filterAppsUserCanView: ReturnType<typeof vi.fn>;
    };
    search?: SearchOperation;
    results?: SearchResults;
    userAttributes?: Record<string, string[]>;
} = {}) => {
    const searchOperation =
        search ?? vi.fn<SearchOperation>().mockResolvedValue(results);
    const calls: string[] = [];
    const analytics = {
        track: vi.fn(() => {
            calls.push('analytics');
        }),
    };
    const projectModel = {
        getSummary: vi.fn(async () => {
            calls.push('projectSummary');
            return { organizationUuid, name: 'Privacy project canary' };
        }),
    };
    const searchModel = {
        search: vi.fn<SearchOperation>((...args) => {
            calls.push('searchModel');
            return searchOperation(...args);
        }),
    };
    const userAttributesModel = {
        getAttributeValuesForOrgMember: vi
            .fn()
            .mockResolvedValue(userAttributes),
    };
    const spacePermissionService = {
        getAccessibleSpaceUuids: vi.fn(async () => {
            calls.push('spaceAccess');
            return [];
        }),
        resolveAccessBatch: vi.fn(async () => {
            calls.push('contentAccess');
            return [];
        }),
    };
    const service = new SearchService({
        documentService: {
            filterViewableUuids: vi.fn().mockResolvedValue([]),
        } as never,
        analytics: analytics as never,
        searchModel: searchModel as never,
        projectModel: projectModel as never,
        spaceModel: {} as never,
        userAttributesModel: userAttributesModel as never,
        spacePermissionService: spacePermissionService as never,
        appGenerateService: appGenerateService as never,
    });
    const loggerInfo = vi.fn();
    (
        service as unknown as {
            logger: { info: typeof loggerInfo };
        }
    ).logger.info = loggerInfo;

    return {
        analytics,
        calls,
        loggerInfo,
        projectModel,
        search: searchOperation,
        searchModel,
        service,
        spacePermissionService,
        userAttributesModel,
    };
};

const getTimingRecords = (
    loggerInfo: ReturnType<typeof vi.fn>,
): OmnibarSearchTimingSnapshot[] =>
    loggerInfo.mock.calls.map(
        ([, record]) => record as OmnibarSearchTimingSnapshot,
    );

describe('SearchService omnibar timing', () => {
    it('emits one privacy-safe success record for the default source without changing results or call order', async () => {
        const { calls, loggerInfo, searchModel, service } = makeService();

        await expect(
            service.getSearchResults(user, projectUuid, query, undefined, {
                type: malformedTypeFilter as never,
            }),
        ).resolves.toEqual(emptyResults);

        expect(calls).toEqual([
            'projectSummary',
            'searchModel',
            'spaceAccess',
            'contentAccess',
            'analytics',
        ]);
        expect(vi.mocked(searchModel.search)).toHaveBeenCalledWith(
            projectUuid,
            query,
            { type: malformedTypeFilter },
            expect.anything(),
        );
        expect(loggerInfo).toHaveBeenCalledOnce();
        const [message, record] = loggerInfo.mock.calls[0];
        expect(message).toBe('Omnibar search timing completed');
        expect(record).toMatchObject({
            event: 'omnibar.search.timing',
            outcome: 'success',
            source: 'omnibar',
            verifiedOnly: false,
        });
        expect(record.serverVersion).toEqual(expect.any(String));
        expect(record.invocationId).toEqual(expect.any(String));
        expect(record.phaseStatuses.userAttributes).toBe('skipped');
        expect(record.phaseStatuses.dataAppAccess).toBe('skipped');

        const serialized = JSON.stringify(record);
        [
            projectUuid,
            organizationUuid,
            userUuid,
            query,
            malformedTypeFilter,
            'Privacy project canary',
        ].forEach((canary) => expect(serialized).not.toContain(canary));
    });

    it('does not emit a timing record for ai_search_box', async () => {
        const { loggerInfo, searchModel, service } = makeService();

        await expect(
            service.getSearchResults(user, projectUuid, query, 'ai_search_box'),
        ).resolves.toEqual(emptyResults);

        expect(loggerInfo).not.toHaveBeenCalled();
        expect(vi.mocked(searchModel.search)).toHaveBeenCalledWith(
            projectUuid,
            query,
            undefined,
            undefined,
        );
    });

    it('times conditional user-attribute and data-app access', async () => {
        const field = {
            requiredAttributes: { region: 'uk' },
            tablesRequiredAttributes: {},
            tablesAnyAttributes: {},
        } as unknown as SearchResults['fields'][number];
        const dataApp = {
            uuid: 'data-app-uuid',
            name: 'Data app',
        } as SearchResults['dataApps'][number];
        const results = {
            ...emptyResults,
            fields: [field],
            dataApps: [dataApp],
        };
        const appGenerateService = {
            dataAppsEnabledFor: vi.fn().mockResolvedValue(true),
            filterAppsUserCanView: vi.fn().mockResolvedValue([dataApp]),
        };
        const { loggerInfo, service, userAttributesModel } = makeService({
            appGenerateService,
            results,
            userAttributes: { region: ['uk'] },
        });

        await expect(
            service.getSearchResults(user, projectUuid, query),
        ).resolves.toMatchObject({ fields: [field], dataApps: [dataApp] });

        const [record] = getTimingRecords(loggerInfo);
        expect(record.phaseStatuses.userAttributes).toBe('complete');
        expect(record.phaseStatuses.dataAppAccess).toBe('complete');
        expect(
            vi.mocked(userAttributesModel.getAttributeValuesForOrgMember),
        ).toHaveBeenCalledOnce();
        expect(
            vi.mocked(appGenerateService.filterAppsUserCanView),
        ).toHaveBeenCalledOnce();
    });

    it('records project denial and skips later phases', async () => {
        const { loggerInfo, searchModel, service } = makeService();
        Object.assign(service, {
            createAuditedAbility: () => ({
                cannot: () => true,
            }),
        });

        await expect(
            service.getSearchResults(user, projectUuid, query),
        ).rejects.toBeInstanceOf(ForbiddenError);

        const [record] = getTimingRecords(loggerInfo);
        expect(record.outcome).toBe('error');
        expect(record.phaseStatuses.projectSummary).toBe('complete');
        expect(record.phaseStatuses.searchModel).toBe('skipped');
        expect(searchModel.search).not.toHaveBeenCalled();
    });

    it('preserves the original search error when completion logging throws', async () => {
        const failure = new Error('original search failure');
        const search = vi.fn<SearchOperation>().mockRejectedValue(failure);
        const { loggerInfo, service } = makeService({ search });
        loggerInfo.mockImplementation(() => {
            throw new Error('logger failure');
        });

        await expect(
            service.getSearchResults(user, projectUuid, query),
        ).rejects.toBe(failure);
        expect(loggerInfo).toHaveBeenCalledOnce();
    });

    it('returns successful results when completion logging throws', async () => {
        const { loggerInfo, service } = makeService();
        loggerInfo.mockImplementation(() => {
            throw new Error('logger failure');
        });

        await expect(
            service.getSearchResults(user, projectUuid, query),
        ).resolves.toEqual(emptyResults);
        expect(loggerInfo).toHaveBeenCalledOnce();
    });

    it('keeps interleaved invocation outcomes and identifiers isolated', async () => {
        const first = deferred<SearchResults>();
        const firstFailure = new Error('first invocation failed');
        const search = vi.fn<SearchOperation>(
            (_projectUuid: string, invocationQuery: string) =>
                invocationQuery === 'first-query'
                    ? first.promise
                    : Promise.resolve(emptyResults),
        );
        const { loggerInfo, service } = makeService({ search });

        const firstInvocation = service.getSearchResults(
            user,
            projectUuid,
            'first-query',
        );
        const secondInvocation = service.getSearchResults(
            user,
            projectUuid,
            'second-query',
        );

        await expect(secondInvocation).resolves.toEqual(emptyResults);
        first.reject(firstFailure);
        await expect(firstInvocation).rejects.toBe(firstFailure);

        const records = getTimingRecords(loggerInfo);
        expect(records).toHaveLength(2);
        expect(records.map(({ outcome }) => outcome).sort()).toEqual([
            'error',
            'success',
        ]);
        expect(
            new Set(records.map(({ invocationId }) => invocationId)).size,
        ).toBe(2);
        const failedRecord = records.find(({ outcome }) => outcome === 'error');
        const successfulRecord = records.find(
            ({ outcome }) => outcome === 'success',
        );
        expect(failedRecord?.phaseStatuses.searchModel).toBe('error');
        expect(failedRecord?.phaseStatuses.spaceAccess).toBe('skipped');
        expect(successfulRecord?.phaseStatuses.searchModel).toBe('complete');
        expect(successfulRecord?.phaseStatuses.spaceAccess).toBe('complete');
    });
});
