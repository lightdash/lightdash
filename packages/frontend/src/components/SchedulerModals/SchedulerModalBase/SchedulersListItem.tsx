import {
    Button,
    Classes,
    Menu,
    MenuDivider,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { SchedulerAndTargets } from '@lightdash/common';
import cronstrue from 'cronstrue';
import React, { FC } from 'react';
import {
    InfoContainer,
    PageDetailsContainer,
    SeparatorDot,
    UpdatedInfoLabel,
} from '../../common/PageHeader';
import {
    SchedulerContainer,
    SchedulerDetailsContainer,
    SchedulerName,
} from './SchedulerModalBase.styles';

type SchedulersListItemProps = {
    scheduler: SchedulerAndTargets;
    onEdit: (schedulerUuid: string) => void;
    onDelete: (schedulerUuid: string) => void;
};

const SchedulersListItem: FC<SchedulersListItemProps> = ({
    scheduler,
    onEdit,
    onDelete,
}) => {
    return (
        <SchedulerContainer>
            <SchedulerDetailsContainer
                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
            >
                <SchedulerName>{scheduler.name}</SchedulerName>
                <Popover2
                    content={
                        <Menu>
                            <MenuItem2
                                icon="edit"
                                text="Edit"
                                onClick={() => onEdit(scheduler.schedulerUuid)}
                            />
                            <MenuDivider />
                            <MenuItem2
                                icon="delete"
                                intent="danger"
                                text="Delete"
                                onClick={() =>
                                    onDelete(scheduler.schedulerUuid)
                                }
                            />
                        </Menu>
                    }
                    position={PopoverPosition.BOTTOM_RIGHT}
                    lazy
                >
                    <Button minimal icon="more" />
                </Popover2>
            </SchedulerDetailsContainer>
            <PageDetailsContainer>
                <UpdatedInfoLabel>
                    {cronstrue.toString(scheduler.cron, {
                        verbose: true,
                        throwExceptionOnParseError: false,
                    })}
                </UpdatedInfoLabel>

                <SeparatorDot icon="dot" size={6} />

                <InfoContainer>
                    {scheduler.targets.length} recipients
                </InfoContainer>
            </PageDetailsContainer>
        </SchedulerContainer>
    );
};

export default SchedulersListItem;
