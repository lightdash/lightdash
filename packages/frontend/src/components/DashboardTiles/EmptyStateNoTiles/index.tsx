import { Intent, NonIdealState, PopoverPosition } from '@blueprintjs/core';
import { Dashboard, Dashboard as IDashboard } from '@lightdash/common';
import { FC, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { appendNewTilesToBottom } from '../../../hooks/dashboard/useDashboard';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AddTileButton from '../AddTileButton';
import {
    ButtonWrapper,
    CTA,
    EmptyStateIcon,
    EmptyStateWrapper,
    Title,
} from './EmptyStateNoTiles.styles';

interface SavedChartsAvailableProps {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    isEditMode: boolean;
}

const SavedChartsAvailable: FC<SavedChartsAvailableProps> = ({
    onAddTiles,
    isEditMode,
}) => {
    return (
        <EmptyStateWrapper>
            <EmptyStateIcon icon="grouped-bar-chart" size={59} />
            <Title>Start building your dashboard!</Title>
            {isEditMode && (
                <AddTileButton
                    onAddTiles={onAddTiles}
                    intent={Intent.PRIMARY}
                    popoverPosition={PopoverPosition.BOTTOM}
                />
            )}
        </EmptyStateWrapper>
    );
};

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
    </EmptyStateWrapper>
);

const EmptyStateNoTiles: FC<SavedChartsAvailableProps> = ({
    onAddTiles,
    isEditMode,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const savedChartsRequest = useSavedCharts(projectUuid);
    const savedCharts = savedChartsRequest.data || [];
    const hasSavedCharts = savedCharts.length > 0;

    return (
        <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
            <div style={{ padding: '50px 0' }}>
                <NonIdealState
                    description={
                        hasSavedCharts ? (
                            <SavedChartsAvailable
                                onAddTiles={onAddTiles}
                                isEditMode={isEditMode}
                            />
                        ) : (
                            <NoSavedChartsAvailable />
                        )
                    }
                    action={
                        !hasSavedCharts ? (
                            <RunQueryButton projectId={projectUuid} />
                        ) : undefined
                    }
                />
            </div>
        </TrackSection>
    );
};

export default EmptyStateNoTiles;
