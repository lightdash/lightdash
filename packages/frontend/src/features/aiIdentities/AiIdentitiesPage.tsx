import {
    AiIdentityJobStatus,
    AiIdentityState,
    type AiIdentityExportFormat,
    type AiIdentityFilter,
} from '@lightdash/common';
import { Select, Tabs } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useSearchParams } from 'react-router';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import { AiIdentityAutomation } from './AiIdentityAutomation';
import { AiIdentityCreationSetup } from './AiIdentityCreationSetup';
import { AiIdentityJobCallout } from './AiIdentityJobCallout';
import { AiIdentityRequestLog } from './AiIdentityRequestLog';
import { AiIdentityTriage } from './AiIdentityTriage';
import { aiIdentityApi } from './api';
import {
    getAiIdentityFilter,
    getAiIdentityListParams,
    getAiIdentitySort,
    getAiIdentityTab,
    type AiIdentityTab,
} from './params';
import { refreshAiIdentityCounts } from './refresh';

export const AiIdentitiesPage: FC = () => {
    const [params, setParams] = useSearchParams();
    const searchInput = params.get('search') ?? '';
    const [debouncedSearch] = useDebouncedValue(searchInput, 300);
    const [actionError, setActionError] = useState<string | null>(null);
    const queryClient = useQueryClient();
    const accountsQuery = useQuery({
        queryKey: ['ai-identity-accounts'],
        queryFn: aiIdentityApi.accounts,
    });
    const accounts = accountsQuery.data ?? [];
    const defaultAccount = [...accounts].sort(
        (a, b) => b.counts.failed - a.counts.failed,
    )[0];
    const selectedAccount = accounts.find(
        (item) => item.aiIdentityAccountUuid === params.get('account'),
    );
    const accountUuid =
        selectedAccount?.aiIdentityAccountUuid ??
        defaultAccount?.aiIdentityAccountUuid;
    const account = accounts.find(
        (item) => item.aiIdentityAccountUuid === accountUuid,
    );
    const tab = getAiIdentityTab(params);
    const sort = getAiIdentitySort(params);
    const filter = useMemo(
        () =>
            accountUuid
                ? getAiIdentityFilter(params, accountUuid, debouncedSearch)
                : null,
        [accountUuid, params, debouncedSearch],
    );
    const jobUuid = params.get('job');
    const jobQuery = useQuery({
        queryKey: ['ai-identity-job', jobUuid],
        queryFn: () => aiIdentityApi.job(jobUuid!),
        enabled: !!jobUuid,
        refetchInterval: (data) =>
            data?.status === AiIdentityJobStatus.DONE ||
            data?.status === AiIdentityJobStatus.FAILED
                ? false
                : 1500,
    });

    const setParam = (key: string, value: string | null) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value);
        else next.delete(key);
        setParams(next);
    };

    const setMultiParam = (key: string, values: string[]) => {
        const next = new URLSearchParams(params);
        next.delete(key);
        if (key === 'state') next.delete('reason');
        if (key === 'reason' && values.length > 0) {
            next.delete('state');
            next.append('state', AiIdentityState.FAILED);
        }
        values.forEach((value) => next.append(key, value));
        setParams(next);
    };

    const jobDone = jobQuery.data?.done;
    const jobStatus = jobQuery.data?.status;
    useEffect(() => {
        if (jobStatus === undefined) return;
        void refreshAiIdentityCounts(queryClient);
        if (
            jobStatus !== AiIdentityJobStatus.DONE &&
            jobStatus !== AiIdentityJobStatus.FAILED
        )
            return;
        void queryClient.invalidateQueries(['ai-identity-provisioning']);
        void queryClient.invalidateQueries(['ai-identity-provisioning-plan']);
        void queryClient.invalidateQueries(['ai-identity-request-log']);
    }, [jobDone, jobStatus, queryClient]);

    const startJob = async (
        kind: 'test' | 'export',
        target: AiIdentityFilter,
        format?: AiIdentityExportFormat,
        roleForTwin?: string | null,
    ) => {
        try {
            setActionError(null);
            const job =
                kind === 'test'
                    ? await aiIdentityApi.bulkTest({ filter: target })
                    : await aiIdentityApi.export({
                          filter: target,
                          format: format ?? 'json',
                          ...(roleForTwin === undefined ? {} : { roleForTwin }),
                      });
            setParam('job', job.jobUuid);
        } catch {
            setActionError(`Could not start the ${kind} job. Try again.`);
        }
    };

    if (accountsQuery.isLoading) return <EmptyStateLoader />;

    return (
        <SettingsPage
            title="AI identities"
            description="AI runs as each person's own Snowflake AI identity, with the grants your team gives it."
            actions={
                accounts.length > 1 ? (
                    <Select
                        aria-label="Snowflake account"
                        data={accounts.map((item) => ({
                            value: item.aiIdentityAccountUuid,
                            label: item.snowflakeAccount,
                        }))}
                        value={accountUuid}
                        onChange={(value) => setParam('account', value)}
                    />
                ) : undefined
            }
        >
            {accountsQuery.isError && (
                <Callout variant="danger">
                    Could not load AI identities.
                </Callout>
            )}
            {accountsQuery.isSuccess && accounts.length === 0 && (
                <Callout variant="info">
                    Connect a Snowflake project to set up AI identities.
                </Callout>
            )}
            {actionError && <Callout variant="danger">{actionError}</Callout>}
            <AiIdentityJobCallout job={jobQuery.data} />
            {account && filter && (
                <Tabs
                    value={tab}
                    onChange={(value) =>
                        setParam('tab', value as AiIdentityTab)
                    }
                >
                    <Tabs.List>
                        <Tabs.Tab value="triage">Triage</Tabs.Tab>
                        <Tabs.Tab value="setup">Setup</Tabs.Tab>
                        <Tabs.Tab value="automation">Automation</Tabs.Tab>
                        <Tabs.Tab value="request-log">Request log</Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="triage" pt="lg">
                        <AiIdentityTriage
                            key={getAiIdentityListParams(
                                filter,
                                sort,
                                1,
                            ).toString()}
                            account={account}
                            job={jobQuery.data}
                            filter={filter}
                            sort={sort}
                            searchInput={searchInput}
                            onSearchInput={(value) => setParam('search', value)}
                            onParam={setParam}
                            onMultiParam={setMultiParam}
                            onJob={startJob}
                        />
                    </Tabs.Panel>
                    <Tabs.Panel value="setup" pt="lg" keepMounted={false}>
                        <AiIdentityCreationSetup
                            key={account.aiIdentityAccountUuid}
                            account={account}
                            onJob={startJob}
                            onProvisioningJob={(uuid) => setParam('job', uuid)}
                        />
                    </Tabs.Panel>
                    <Tabs.Panel value="automation" pt="lg">
                        <AiIdentityAutomation account={account} />
                    </Tabs.Panel>
                    <Tabs.Panel value="request-log" pt="lg">
                        <AiIdentityRequestLog />
                    </Tabs.Panel>
                </Tabs>
            )}
        </SettingsPage>
    );
};
