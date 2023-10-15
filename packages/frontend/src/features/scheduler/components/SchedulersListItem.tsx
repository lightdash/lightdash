import { Classes } from '@blueprintjs/core';
import {
    getHumanReadableCronExpression,
    SchedulerAndTargets,
} from '@lightdash/common';
import { Divider, Menu, rem } from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { FC } from 'react';
import {
    InfoContainer,
    PageDetailsContainer,
    SeparatorDot,
    UpdatedInfoLabel,
} from '../../../components/common/PageHeader';
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
                <Menu withArrow width={150} shadow="md">
                    <Menu.Target>
                        <IconDots size={rem(20)} cursor="pointer" />
                    </Menu.Target>

                    <Menu.Dropdown>
                        <Menu.Item
                            icon={<IconPencil size={rem(20)} />}
                            onClick={() => onEdit(scheduler.schedulerUuid)}
                        >
                            Edit
                        </Menu.Item>
                        <Divider />

                        <Menu.Item
                            icon={<IconTrash size={rem(20)} color="red" />}
                            onClick={() => onDelete(scheduler.schedulerUuid)}
                            color="red"
                        >
                            Delete
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </SchedulerDetailsContainer>
            <PageDetailsContainer>
                <UpdatedInfoLabel>
                    {getHumanReadableCronExpression(scheduler.cron)}
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
