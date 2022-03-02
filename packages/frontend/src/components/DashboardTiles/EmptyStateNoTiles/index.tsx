import { Intent, NonIdealState } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import {
    ButtonWrapper,
    CTA,
    EmptyStateIcon,
    EmptyStateWrapper,
    Title,
} from './EmptyStateNoTiles.styles';

const SavedChartsAvailable = () => (
    <EmptyStateWrapper>
        <EmptyStateIcon icon="grouped-bar-chart" size={59} />
        <Title>Start building your dashboard!</Title>
        <p>
            Click ‘Edit dashboard’ to start adding charts and tiles. Don’t
            forget to hit ‘Save’ when you’re done!
        </p>
    </EmptyStateWrapper>
);

const RunQueryButton: FC<{ projectId: string }> = ({ projectId }) => (
    <ButtonWrapper>
        <CTA
            text="Run a query"
            intent={Intent.PRIMARY}
            href={`/projects/${projectId}/tables`}
        />
    </ButtonWrapper>
);

const NoSavedChartsAvailable = () => (
    <EmptyStateWrapper>
        <EmptyStateIcon icon="grouped-bar-chart" size={59} />
        <Title>You haven’t saved any charts yet.</Title>
        <p>
            Create a saved chart from your queries so you can add it to this
            dashboard!
        </p>
    </EmptyStateWrapper>
);

interface Props {
    projectId: string;
}

const EmptyStateNoTiles: FC<Props> = ({ projectId }) => {
    const savedChartsRequest = useSavedCharts(projectId);
    const savedCharts = savedChartsRequest.data || [];
    const hasSavedCharts = savedCharts.length > 0;

    return (
        <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
            <div style={{ padding: '50px 0' }}>
                <NonIdealState
                    description={
                        hasSavedCharts ? (
                            <SavedChartsAvailable />
                        ) : (
                            <NoSavedChartsAvailable />
                        )
                    }
                    action={
                        !hasSavedCharts ? (
                            <RunQueryButton projectId={projectId} />
                        ) : undefined
                    }
                />
            </div>
        </TrackSection>
    );
};

export default EmptyStateNoTiles;
