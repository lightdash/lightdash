import { AnchorButton } from '@blueprintjs/core';
import { SessionUser } from 'common';
import React, { FC } from 'react';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import LatestCard from '../LatestCard';
import {
    ChartName,
    CreateChartButton,
    UpdatedLabel,
    ViewAllButton,
} from './LatestSavedCharts.style';

export const UpdatedInfo: FC<{
    updatedAt: Date;
    user: Partial<SessionUser> | undefined;
}> = ({ updatedAt, user }) => {
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <UpdatedLabel>
            Last edited <b>{timeAgo}</b>{' '}
            {user && user.firstName ? (
                <>
                    by{' '}
                    <b>
                        {user.firstName} {user.lastName}
                    </b>
                </>
            ) : (
                ''
            )}
        </UpdatedLabel>
    );
};
const LatestSavedCharts: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const savedChartsRequest = useSavedCharts(projectUuid);
    const savedCharts = savedChartsRequest.data || [];
    return (
        <LatestCard
            isLoading={savedChartsRequest.isLoading}
            title="Browse saved charts"
            headerAction={
                savedCharts.length > 0 ? (
                    <ViewAllButton
                        text={`View all ${savedCharts.length}`}
                        minimal
                        outlined
                        href={`/projects/${projectUuid}/saved`}
                    />
                ) : (
                    <AnchorButton
                        target="_blank"
                        text="Learn"
                        minimal
                        outlined
                        href="https://docs.lightdash.com/get-started/exploring-data/sharing-insights"
                        style={{ width: 100 }}
                    />
                )
            }
        >
            {savedCharts
                .sort(
                    (a, b) =>
                        new Date(b.updatedAt).getTime() -
                        new Date(a.updatedAt).getTime(),
                )
                .slice(0, 5)
                .map(({ uuid, name, updatedAt, updatedByUser }) => (
                    <ChartName
                        key={uuid}
                        minimal
                        href={`/projects/${projectUuid}/saved/${uuid}`}
                        alignText="left"
                    >
                        <>
                            {name}
                            <UpdatedInfo
                                updatedAt={updatedAt}
                                user={updatedByUser}
                            />
                        </>
                    </ChartName>
                ))}
            {savedCharts.length === 0 && (
                <CreateChartButton
                    minimal
                    href={`/projects/${projectUuid}/tables`}
                    intent="primary"
                >
                    + Create a saved chart
                </CreateChartButton>
            )}
        </LatestCard>
    );
};

export default LatestSavedCharts;
