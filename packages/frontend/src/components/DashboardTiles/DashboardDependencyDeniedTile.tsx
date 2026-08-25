import type { DashboardTile } from '@lightdash/common';
import { IconLock } from '@tabler/icons-react';
import type { ComponentProps, FC } from 'react';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import TileBase from './TileBase';

type Props = Pick<
    ComponentProps<typeof TileBase>,
    'onDelete' | 'onEdit' | 'isEditMode'
> & {
    tile: DashboardTile;
};

const DashboardDependencyDeniedTile: FC<Props> = (props) => (
    <TileBase {...props} title="" hasError>
        <SuboptimalState
            adaptive
            icon={IconLock}
            title="Content unavailable"
            description="You don't have access to this dashboard tile."
        />
    </TileBase>
);

export default DashboardDependencyDeniedTile;
