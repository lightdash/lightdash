import { Button, Colors, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import {
    SpaceFooter,
    SpaceHeader,
    SpaceItemCount,
    SpaceLinkButton,
    SpaceTitle,
} from './SpaceBrowser.styles';
import { SpaceBrowserMenu } from './SpaceBrowserMenu';

interface SpaceItemProps {
    projectUuid: string;
    uuid: string;
    name: string;
    dashboardsCount: number;
    queriesCount: number;
    onRename: () => void;
    onDelete: () => void;
}

const SpaceItem: FC<SpaceItemProps> = ({
    projectUuid,
    uuid,
    name,
    dashboardsCount,
    queriesCount,
    onRename,
    onDelete,
}) => {
    return (
        <SpaceLinkButton
            key={uuid}
            minimal
            outlined
            href={`/projects/${projectUuid}/spaces/${uuid}`}
        >
            <SpaceHeader>
                <Icon icon="folder-close" size={20} color={Colors.BLUE5}></Icon>
                <div
                    onClick={(e) => {
                        // prevent clicks in menu to trigger redirect
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                >
                    <SpaceBrowserMenu onRename={onRename} onDelete={onDelete}>
                        <Tooltip2 content="View options">
                            <Button minimal icon="more" />
                        </Tooltip2>
                    </SpaceBrowserMenu>
                </div>
            </SpaceHeader>
            <SpaceTitle ellipsize>{name}</SpaceTitle>
            <SpaceFooter>
                <SpaceItemCount icon="control" value={dashboardsCount} />
                <SpaceItemCount icon="chart" value={queriesCount} />
            </SpaceFooter>
        </SpaceLinkButton>
    );
};

export default SpaceItem;
