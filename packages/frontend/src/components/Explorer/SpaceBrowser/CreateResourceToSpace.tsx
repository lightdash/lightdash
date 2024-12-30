import { assertUnreachable } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import { useNavigate, useParams } from 'react-router-dom-v5-compat';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { DEFAULT_DASHBOARD_NAME } from '../../../pages/SavedDashboards';
import { AddToSpaceResources } from './AddResourceToSpaceModal';

interface Props {
    resourceType: AddToSpaceResources;
}

const CreateResourceToSpace: FC<Props> = ({ resourceType }) => {
    const navigate = useNavigate();
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();

    const {
        isSuccess: hasCreatedDashboard,
        mutate: createDashboard,
        data: newDashboard,
    } = useCreateMutation(projectUuid);

    useEffect(() => {
        if (hasCreatedDashboard && newDashboard) {
            return navigate(
                `/projects/${projectUuid}/dashboards/${newDashboard.uuid}`,
            );
        }
    }, [navigate, hasCreatedDashboard, newDashboard, projectUuid]);

    useEffect(() => {
        switch (resourceType) {
            case AddToSpaceResources.CHART:
                return navigate(
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
    }, [navigate, resourceType, createDashboard, projectUuid, spaceUuid]);

    return null;
};

export default CreateResourceToSpace;
