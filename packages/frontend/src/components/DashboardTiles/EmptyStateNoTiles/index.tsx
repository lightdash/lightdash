import { subject } from '@casl/ability';
import { type Dashboard } from '@lightdash/common';
import {
    IconChartBarOff,
    IconLayoutDashboard,
    IconPlayerPlay,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router';
import { useProjectSavedChartStatus } from '../../../hooks/useOnboardingStatus';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import MantineLinkButton from '../../common/MantineLinkButton';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import AddTileButton from '../AddTileButton';

interface SavedChartsAvailableProps {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    emptyContainerType?: 'dashboard' | 'tab';
    isEditMode: boolean;
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    activeTabUuid?: string;
    dashboardTabs?: Dashboard['tabs'];
}

const EmptyStateNoTiles: FC<SavedChartsAvailableProps> = ({
    onAddTiles,
    emptyContainerType = 'dashboard',
    isEditMode,
    setAddingTab,
    activeTabUuid,
    dashboardTabs,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const { data: hasSavedCharts } = useProjectSavedChartStatus(projectUuid);

    // Only check permissions when in edit mode (when it's actually needed)
    const userCanCreateDashboard = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
        { enabled: isEditMode },
    );

    const dashboardEmptyStateTitle = () => {
        switch (emptyContainerType) {
            case 'dashboard':
                return userCanCreateDashboard && isEditMode
                    ? 'Start building your dashboard!'
                    : 'Dashboard is empty.';
            case 'tab':
                return userCanCreateDashboard && isEditMode
                    ? 'Add tiles to this tab'
                    : 'Tab is empty';
            default:
                return 'Dashboard is empty.';
        }
    };

    return (
        <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
            <div style={{ padding: '50px 0' }}>
                {hasSavedCharts ? (
                    <SuboptimalState
                        icon={IconLayoutDashboard}
                        title={dashboardEmptyStateTitle()}
                        action={
                            userCanCreateDashboard && isEditMode ? (
                                <AddTileButton
                                    onAddTiles={onAddTiles}
                                    setAddingTab={setAddingTab}
                                    activeTabUuid={activeTabUuid}
                                    dashboardTabs={dashboardTabs}
                                />
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
