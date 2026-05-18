const setUserMock = jest.fn();
const setTagsMock = jest.fn();
jest.mock('@sentry/node', () => {
    const actual = jest.requireActual('@sentry/node');
    return {
        ...actual,
        setUser: (...args: unknown[]) => setUserMock(...args),
        setTags: (...args: unknown[]) => setTagsMock(...args),
    };
});

// eslint-disable-next-line import/first
import { QueryHistoryStatus } from '@lightdash/common';
// eslint-disable-next-line import/first
import { NatsWorker } from './NatsWorker';

const makeWorker = (overrides: {
    queryHistory?: unknown;
    resolveOrganizationName?: jest.Mock;
    getThrows?: Error;
}) => {
    const get = overrides.getThrows
        ? jest.fn().mockRejectedValue(overrides.getThrows)
        : jest.fn().mockResolvedValue(overrides.queryHistory);
    const queryHistoryModel = { getByQueryUuid: get };
    const resolveOrganizationName =
        overrides.resolveOrganizationName ??
        jest.fn().mockResolvedValue(undefined);

    const worker = new NatsWorker({
        natsClient: { isHealthy: async () => true } as never,
        asyncQueryService: {} as never,
        queryHistoryModel: queryHistoryModel as never,
        streams: [],
        workerConcurrency: 1,
        resolveOrganizationName,
    });

    return { worker, queryHistoryModel, resolveOrganizationName };
};

describe('NatsWorker.applyQuerySentryContext', () => {
    beforeEach(() => {
        setUserMock.mockClear();
        setTagsMock.mockClear();
    });

    it('sets organization.uuid + organization.name tags when both are available', async () => {
        const { worker, resolveOrganizationName } = makeWorker({
            queryHistory: {
                queryUuid: 'q-1',
                organizationUuid: 'org-1',
                createdByUserUuid: 'user-1',
                status: QueryHistoryStatus.PENDING,
            },
            resolveOrganizationName: jest.fn().mockResolvedValue('Acme'),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (worker as any).applyQuerySentryContext('q-1');

        expect(resolveOrganizationName).toHaveBeenCalledWith('org-1');
        expect(setUserMock).toHaveBeenCalledWith({
            id: 'user-1',
            organization: 'org-1',
        });
        expect(setTagsMock).toHaveBeenCalledWith({
            'organization.uuid': 'org-1',
            'organization.name': 'Acme',
        });
    });

    it('omits organization.name when the resolver returns undefined', async () => {
        const { worker } = makeWorker({
            queryHistory: {
                queryUuid: 'q-2',
                organizationUuid: 'org-2',
                createdByUserUuid: 'user-2',
                status: QueryHistoryStatus.PENDING,
            },
            resolveOrganizationName: jest.fn().mockResolvedValue(undefined),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (worker as any).applyQuerySentryContext('q-2');

        expect(setTagsMock).toHaveBeenCalledWith({
            'organization.uuid': 'org-2',
        });
        expect(setTagsMock.mock.calls[0][0]).not.toHaveProperty(
            'organization.name',
        );
    });

    it('does not crash when the resolver rejects', async () => {
        const { worker } = makeWorker({
            queryHistory: {
                queryUuid: 'q-3',
                organizationUuid: 'org-3',
                createdByUserUuid: 'user-3',
                status: QueryHistoryStatus.PENDING,
            },
            resolveOrganizationName: jest
                .fn()
                .mockRejectedValue(new Error('boom')),
        });

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (worker as any).applyQuerySentryContext('q-3'),
        ).resolves.toBeUndefined();
        expect(setTagsMock).toHaveBeenCalledWith({
            'organization.uuid': 'org-3',
        });
    });

    it('is a no-op when queryHistory is not found', async () => {
        const { worker } = makeWorker({ queryHistory: undefined });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (worker as any).applyQuerySentryContext('q-missing');

        expect(setUserMock).not.toHaveBeenCalled();
        expect(setTagsMock).not.toHaveBeenCalled();
    });

    it('does not crash when the queryHistory lookup throws', async () => {
        const { worker } = makeWorker({
            getThrows: new Error('db down'),
        });

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (worker as any).applyQuerySentryContext('q-error'),
        ).resolves.toBeUndefined();
        expect(setUserMock).not.toHaveBeenCalled();
        expect(setTagsMock).not.toHaveBeenCalled();
    });
});
