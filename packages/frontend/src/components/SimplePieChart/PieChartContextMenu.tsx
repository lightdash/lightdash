import { subject } from '@casl/ability';
import { ResultValue } from '@lightdash/common';
import { Box, Menu, MenuProps, Portal } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useApp } from '../../providers/AppProvider';
import MantineIcon from '../common/MantineIcon';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

export type PieChartContextMenuProps = {
    menuPosition?: {
        left: number;
        top: number;
    };
    value?: ResultValue;
} & Pick<MenuProps, 'position' | 'opened' | 'onOpen' | 'onClose'>;

const PieChartContextMenu: FC<PieChartContextMenuProps> = ({
    menuPosition,
    value,
    opened,
    onOpen,
    onClose,
}) => {
    const { user } = useApp();
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    // const tracking = useTracking(true);
    const metricQueryData = useMetricQueryDataContext(true);

    const { projectUuid } = useParams<{ projectUuid: string }>();

    if (!value || !metricQueryData) {
        return null;
    }

    // const { openUnderlyingDataModal, openDrillDownModel } = metricQueryData;
    // const { track } = tracking;

    const canViewUnderlyingData =
        // TODO: implement this
        false &&
        user.data?.ability?.can(
            'view',
            subject('UnderlyingData', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            }),
        );

    const canViewDrillInto =
        // TODO: implement this
        false &&
        user.data?.ability?.can(
            'manage',
            subject('Explore', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            }),
        );

    const handleCopy = () => {
        if (value) {
            clipboard.copy(value.formatted);
            showToastSuccess({
                title: 'Copied to clipboard!',
            });
        }
    };

    const handleOpenUnderlyingDataModal = () => {
        // TODO: implement this
        // openUnderlyingDataModal({
        //     item,
        //     value,
        //     fieldValues: underlyingFieldValues,
        // });
        // track({
        //     name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
        //     properties: {
        //         organizationId: user?.data?.organizationUuid,
        //         userId: user?.data?.userUuid,
        //         projectId: projectUuid,
        //     },
        // });
    };

    const handleOpenDrillIntoModal = () => {
        // TODO: implement this
        // openDrillDownModel({
        //     item,
        //     fieldValues: underlyingFieldValues,
        // });
        // track({
        //     name: EventName.DRILL_BY_CLICKED,
        //     properties: {
        //         organizationId: user.data?.organizationUuid,
        //         userId: user.data?.userUuid,
        //         projectId: projectUuid,
        //     },
        // });
    };

    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            radius="xs"
            offset={{
                mainAxis: 10,
            }}
        >
            <Portal>
                <Menu.Target>
                    <Box
                        sx={{ position: 'absolute', ...(menuPosition ?? {}) }}
                    />
                </Menu.Target>
            </Portal>

            <Menu.Dropdown>
                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconCopy}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                    onClick={handleCopy}
                >
                    Copy
                </Menu.Item>

                {canViewUnderlyingData ? (
                    <Menu.Item
                        icon={
                            <MantineIcon
                                icon={IconStack}
                                size="md"
                                fillOpacity={0}
                            />
                        }
                        onClick={handleOpenUnderlyingDataModal}
                    >
                        View underlying data
                    </Menu.Item>
                ) : null}

                {canViewDrillInto ? (
                    <Menu.Item
                        icon={
                            <MantineIcon
                                icon={IconArrowBarToDown}
                                size="md"
                                fillOpacity={0}
                            />
                        }
                        onClick={handleOpenDrillIntoModal}
                    >
                        Drill into "{value.formatted}"
                    </Menu.Item>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    );
};

export default PieChartContextMenu;
