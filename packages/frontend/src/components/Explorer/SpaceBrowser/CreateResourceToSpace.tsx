import { assertUnreachable } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { DEFAULT_DASHBOARD_NAME } from '../../../pages/SavedDashboards';
import { AddToSpaceResources } from './AddResourceToSpaceModal';

interface RouteProps {
    projectUuid: string;
    spaceUuid: string;
}

interface Props {
    resourceType: AddToSpaceResources;
}

const CreateResourceToSpace: FC<Props> = ({ resourceType }) => {
    const history = useHistory();
    const { projectUuid, spaceUuid } = useParams<RouteProps>();

    const {
        isSuccess: hasCreatedDashboard,
        mutate: createDashboard,
        data: newDashboard,
    } = useCreateMutation(projectUuid);

    useEffect(() => {
        if (hasCreatedDashboard && newDashboard) {
            return history.push(
                `/projects/${projectUuid}/dashboards/${newDashboard.uuid}`,
            );
        }
    }, [history, hasCreatedDashboard, newDashboard, projectUuid]);

    useEffect(() => {
        switch (resourceType) {
            case AddToSpaceResources.CHART:
                return history.push(
                    `/projects/${projectUuid}/tables/?fromSpace=${spaceUuid}`,
                );
            case AddToSpaceResources.DASHBOARD:
                return createDashboard({
                    name: DEFAULT_DASHBOARD_NAME,
                    tiles: [],
                    spaceUuid,
                    tabs: [],
                });
            default:
                return assertUnreachable(
                    resourceType,
                    'Unexpected resource type during create',
                );
        }
    }, [history, resourceType, createDashboard, projectUuid, spaceUuid]);

    return null;
};

export default CreateResourceToSpace;
