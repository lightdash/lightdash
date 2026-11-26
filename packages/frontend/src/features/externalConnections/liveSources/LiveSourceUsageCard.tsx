/** How much a live data source is used: read-only, over the usage window. */
import { type FC } from 'react';
import { useExternalConnectionApiUsage } from '../hooks/useExternalConnectionApiUsage';
import { useLiveSourceFields } from '../hooks/useLiveSourceFields';
import { toLiveSourceRow, type LiveSourceConnection } from './liveSourceRows';
import {
    SettingsCard,
    SettingsRow,
    SettingsValue,
} from './LiveSourceSettingsRows';

export const LiveSourceUsageCard: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
}> = ({ projectUuid, connection }) => {
    const { data: apiUsage } = useExternalConnectionApiUsage(projectUuid);
    const { data: fields } = useLiveSourceFields({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const { usage } = toLiveSourceRow(connection, apiUsage);
    const windowDays = apiUsage?.[0]?.windowDays;
    return (
        <SettingsCard
            title="Usage"
            titleInfo={
                windowDays === undefined
                    ? 'Usage over the query history retention window'
                    : `Usage over the last ${windowDays} days`
            }
        >
            <SettingsRow label="Charts" hint="Saved charts on this source">
                <SettingsValue isNumber isEmpty={!fields}>
                    {fields?.usedByChartCount.toLocaleString() ?? '—'}
                </SettingsValue>
            </SettingsRow>
            <SettingsRow label="Data read" hint="Returned by the integration">
                <SettingsValue isNumber isEmpty={!usage.isUsed}>
                    {usage.dataRead}
                </SettingsValue>
            </SettingsRow>
            <SettingsRow
                label="API calls"
                hint="Requests sent to the integration"
            >
                <SettingsValue isNumber isEmpty={!usage.isUsed}>
                    {usage.apiCalls}
                </SettingsValue>
            </SettingsRow>
            <SettingsRow
                label="Median latency"
                hint="How long a typical call takes"
            >
                <SettingsValue isNumber isEmpty={!usage.medianLatency}>
                    {usage.medianLatency ?? '—'}
                </SettingsValue>
            </SettingsRow>
        </SettingsCard>
    );
};
