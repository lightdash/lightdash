import { Button } from '@mantine/core';
import { IconBuildingCommunity } from '@tabler/icons-react';
import { type FC } from 'react';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';

type Props = { canManage: boolean; onCreate: () => void };

export const AdoptionEmptyState: FC<Props> = ({ canManage, onCreate }) => (
    <SuboptimalState
        icon={IconBuildingCommunity}
        title="No departments yet"
        description={
            canManage
                ? "Add a department for each part of your organization, including the ones that haven't started using Lightdash. Link groups or assign people to fill them in"
                : 'Ask an admin to add departments for your organization'
        }
        action={
            canManage ? (
                <Button onClick={onCreate}>New department</Button>
            ) : undefined
        }
    />
);
