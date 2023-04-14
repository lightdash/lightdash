import { Field, PivotValue, TableCalculation } from '@lightdash/common';
import { Menu, MenuProps } from '@mantine/core';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import { FC, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import DrillDownModal from '../../MetricQueryData/DrillDownModal';
import {
    UnderlyingValueMap,
    useMetricQueryDataContext,
} from '../../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../../MetricQueryData/UnderlyingDataModal';
import MantineIcon from '../MantineIcon';

type ValueCellMenuProps = {
    item: Field | TableCalculation | undefined;
    value: PivotValue | null;
    row: (PivotValue | null)[];
    onCopy: () => void;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const ValueCellMenu: FC<ValueCellMenuProps> = ({
    children,
    item,
    value: pivotValue,
    row: pivotRow,
    opened,
    onOpen,
    onClose,
    onCopy,
}) => {
    const { track } = useTracking();
    const { openUnderlyingDataModel } = useMetricQueryDataContext();
    const { user } = useApp();
    // TODO: get rid of this from here
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const rowMap = useMemo(() => {
        return pivotRow.reduce<UnderlyingValueMap>((acc, row) => {
            if (row?.fieldId && row.value) {
                return { ...acc, [row.fieldId]: row.value };
            }
            return acc;
        }, {});
    }, [pivotRow]);

    if (!pivotValue || !pivotValue.value) {
        return <>{children}</>;
    }

    const handleOpenUnderlyingDataModal = () => {
        openUnderlyingDataModel(item, pivotValue.value, rowMap);
        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    };

    return (
        <>
            <UnderlyingDataModal />
            <DrillDownModal />

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

                    <Menu.Item
                        icon={
                            <MantineIcon
                                icon={IconArrowBarToDown}
                                size="md"
                                fillOpacity={0}
                            />
                        }
                    >
                        Drill into "{pivotValue.value.formatted}"
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </>
    );
};

export default ValueCellMenu;
