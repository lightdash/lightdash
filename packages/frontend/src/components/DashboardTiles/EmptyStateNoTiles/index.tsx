import { subject } from '@casl/ability';
import { type Dashboard } from '@lightdash/common';
import {
    IconChartBarOff,
    IconLayoutDashboard,
    IconPlayerPlay,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router-dom';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { useApp } from '../../../providers/AppProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { Can } from '../../common/Authorization';
import MantineIcon from '../../common/MantineIcon';
import MantineLinkButton from '../../common/MantineLinkButton';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import AddTileButton from '../AddTileButton';

interface SavedChartsAvailableProps {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    emptyContainerType?: 'dashboard' | 'tab';
    isEditMode: boolean;
}

const EmptyStateNoTiles: FC<SavedChartsAvailableProps> = ({
    onAddTiles,
    emptyContainerType = 'dashboard',
    isEditMode,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const savedChartsRequest = useChartSummaries(projectUuid);

    const savedCharts = savedChartsRequest.data || [];
    const hasSavedCharts = savedCharts.length > 0;

    const userCanCreateDashboard = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
    );

    return (
        <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
            <div style={{ padding: '50px 0' }}>
                {hasSavedCharts ? (
                    <SuboptimalState
                        icon={IconLayoutDashboard}
                        title={
                            userCanManageDashboard
                                ? emptyContainerType === 'dashboard'
                                    ? 'Start building your dashboard!'
                                    : 'Add tiles to this tab'
                                : emptyContainerType === 'dashboard'
                                ? 'Dashboard is empty.'
                                : 'Tab is empty'
                        }
                        action={
                            userCanCreateDashboard && isEditMode ? (
                                <AddTileButton onAddTiles={onAddTiles} />
                            ) : undefined
                        }
                    />
                ) : (
                    <SuboptimalState
                        icon={IconChartBarOff}
                        title="You haven’t saved any charts yet."
                        action={
                            <Can
                                I="manage"
                                this={subject('Explore', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid: projectUuid,
                                })}
                            >
                                <MantineLinkButton
                                    size="xs"
                                    leftIcon={
                                        <MantineIcon icon={IconPlayerPlay} />
                                    }
                                    href={`/projects/${projectUuid}/tables`}
                                >
                                    Run a query
                                </MantineLinkButton>
                            </Can>
                        }
                    />
                )}
            </div>
        </TrackSection>
    );
};

export default EmptyStateNoTiles;
