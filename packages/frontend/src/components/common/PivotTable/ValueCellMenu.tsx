import { subject } from '@casl/ability';
import { Field, PivotValue, TableCalculation } from '@lightdash/common';
import { Menu, MenuProps } from '@mantine/core';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import {
    UnderlyingValueMap,
    useMetricQueryDataContext,
} from '../../MetricQueryData/MetricQueryDataProvider';
import MantineIcon from '../MantineIcon';

type ValueCellMenuProps = {
    rowIndex: number;
    colIndex: number;
    item: Field | TableCalculation | undefined;
    value: PivotValue | null;
    onCopy: () => void;
    getUnderlyingFieldValues: (
        colIndex: number,
        rowIndex: number,
    ) => UnderlyingValueMap;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const ValueCellMenu: FC<ValueCellMenuProps> = ({
    children,
    rowIndex,
    getUnderlyingFieldValues,
    colIndex,
    item,
    value: pivotValue,
    opened,
    onOpen,
    onClose,
    onCopy,
}) => {
    const { user } = useApp();
    const { track } = useTracking();
    const { openUnderlyingDataModal, openDrillDownModel } =
        useMetricQueryDataContext();

    // FIXME: get rid of this from here
    const { projectUuid } = useParams<{ projectUuid: string }>();

    if (!pivotValue || !pivotValue.value) {
        return <>{children}</>;
    }

    const canViewUnderlyingData = user.data?.ability?.can(
        'view',
        subject('UnderlyingData', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: projectUuid,
        }),
    );

    const canViewDrillInto = user.data?.ability?.can(
        'manage',
        subject('Explore', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: projectUuid,
        }),
    );

    const handleOpenUnderlyingDataModal = () => {
        const underlyingFieldValues = getUnderlyingFieldValues(
            rowIndex,
            colIndex,
        );

        openUnderlyingDataModal({
            item,
            value: pivotValue.value,
            fieldValues: underlyingFieldValues,
        });

        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    };

    const handleOpenDrillIntoModal = () => {
        if (!item) return;
        const underlyingFieldValues = getUnderlyingFieldValues(
            rowIndex,
            colIndex,
        );

        openDrillDownModel({
            item,
            fieldValues: underlyingFieldValues,
        });

        track({
            name: EventName.DRILL_BY_CLICKED,
            properties: {
                organizationId: user.data?.organizationUuid,
                userId: user.data?.userUuid,
                projectId: projectUuid,
            },
        });
    };

    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withinPortal
            shadow="md"
            position="bottom-end"
            radius="xs"
            offset={{
                mainAxis: 1,
                crossAxis: 2,
            }}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconCopy}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                    onClick={onCopy}
                >
                    Copy
                </Menu.Item>

                {item && (canViewUnderlyingData || canViewDrillInto) ? (
                    <>
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
                                Drill into "{pivotValue.value.formatted}"
                            </Menu.Item>
                        ) : null}
                    </>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    );
};

export default ValueCellMenu;
