import { AnchorButton, Colors } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useSavedCharts } from '../../hooks/useSpaces';
import LinkButton from '../common/LinkButton';
import LatestCard from './LatestCard';

const LatestSavedCharts: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const savedChartsRequest = useSavedCharts(projectUuid);
    const savedCharts = savedChartsRequest.data || [];
    return (
        <LatestCard
            isLoading={savedChartsRequest.isLoading}
            title={`Browse saved charts (${savedCharts.length})`}
            headerAction={
                savedCharts.length > 0 ? (
                    <LinkButton
                        text="View all"
                        minimal
                        outlined
                        href={`/projects/${projectUuid}/saved`}
                        style={{ width: 100 }}
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
                .map(({ uuid, name }) => (
                    <LinkButton
                        minimal
                        href={`/projects/${projectUuid}/saved/${uuid}`}
                        style={{
                            justifyContent: 'left',
                            color: Colors.DARK_GRAY1,
                            fontWeight: 600,
                            marginBottom: 10,
                        }}
                    >
                        {name}
                    </LinkButton>
                ))}
            {savedCharts.length === 0 && (
                <LinkButton
                    minimal
                    href={`/projects/${projectUuid}/tables`}
                    style={{
                        justifyContent: 'left',
                        fontWeight: 500,
                        marginBottom: 10,
                    }}
                    intent="primary"
                >
                    + Create a saved chart
                </LinkButton>
            )}
        </LatestCard>
    );
};

export default LatestSavedCharts;
