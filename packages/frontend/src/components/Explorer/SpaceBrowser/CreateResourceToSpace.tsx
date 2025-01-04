import { assertUnreachable } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { AddToSpaceResources } from './types';

interface Props {
    resourceType: AddToSpaceResources;
}

const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

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
            void navigate(
                `/projects/${projectUuid}/dashboards/${newDashboard.uuid}`,
            );
        }
    }, [navigate, hasCreatedDashboard, newDashboard, projectUuid]);

    useEffect(() => {
        switch (resourceType) {
            case AddToSpaceResources.CHART:
                void navigate(
                    `/projects/${projectUuid}/tables/?fromSpace=${spaceUuid}`,
                );
                return;
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
