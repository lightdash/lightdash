import { Intent } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { Dashboard } from '@lightdash/common';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import { useApp } from '../../../providers/AppProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { Can } from '../../common/Authorization';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
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
    const { user } = useApp();
    const userCanManageDashboard = user.data?.ability.can(
        'manage',
        'Dashboard',
    );

    return (
        <EmptyStateWrapper>
            <EmptyStateIcon icon="grouped-bar-chart" size={59} />
            <Title>
                {userCanManageDashboard
                    ? 'Start building your dashboard!'
                    : 'Dashboard is empty.'}
            </Title>
            {userCanManageDashboard && isEditMode ? (
                <AddTileButton onAddTiles={onAddTiles} />
            ) : null}
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
    const savedChartsRequest = useChartSummaries(projectUuid);
    const savedCharts = savedChartsRequest.data || [];
    const hasSavedCharts = savedCharts.length > 0;

    const { user } = useApp();

    return (
        <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
            <div style={{ padding: '50px 0' }}>
                <SuboptimalState
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
                            <Can
                                I="manage"
                                this={subject('Explore', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid: projectUuid,
                                })}
                            >
                                <RunQueryButton projectId={projectUuid} />
                            </Can>
                        ) : undefined
                    }
                />
            </div>
        </TrackSection>
    );
};

export default EmptyStateNoTiles;
