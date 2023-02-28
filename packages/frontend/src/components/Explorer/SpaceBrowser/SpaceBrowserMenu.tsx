import { Menu, MenuDivider, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import React from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../../providers/AppProvider';

interface Props {
    isPinned: boolean;
    onRename: () => void;
    onDelete: () => void;
    onTogglePin: () => void;
}

export const SpaceBrowserMenu: React.FC<Props> = ({
    isPinned,
    onRename,
    onDelete,
    onTogglePin,
    children,
}) => {
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return (
        <Popover2
            captureDismiss
            position={PopoverPosition.BOTTOM_RIGHT}
            content={
                <Menu>
                    <MenuItem2 icon="edit" text="Rename" onClick={onRename} />

                    {user.data?.ability.can(
                        'update',
                        subject('Project', { organizationUuid, projectUuid }),
                    ) ? (
                        <MenuItem2
                            role="menuitem"
                            icon="pin"
                            text={
                                isPinned
                                    ? 'Unpin from homepage'
                                    : 'Pin to homepage'
                            }
                            onClick={onTogglePin}
                        />
                    ) : null}

                    <MenuDivider />

                    <MenuItem2
                        icon="cross"
                        intent="danger"
                        text="Remove space"
                        onClick={onDelete}
                    />
                </Menu>
            }
        >
            {children}
        </Popover2>
    );
};
