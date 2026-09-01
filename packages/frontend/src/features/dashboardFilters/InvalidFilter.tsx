import { type DashboardFilterRule } from '@lightdash/common';
import { ActionIcon, Button, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';

type Props = {
    isEditMode: boolean;
    filterRule: DashboardFilterRule;
    onRemove?: () => void;
};

const InvalidFilter: FC<Props> = ({ isEditMode, filterRule, onRemove }) => {
    const getUiString = useUiStrings();
    return (
        <Tooltip
            position="top-start"
            offset={0}
            arrowOffset={16}
            label={
                <Text size="xs">
                    <Text span c="dimmed">
                        Tried to reference field with unknown id:
                    </Text>{' '}
                    {filterRule.target.fieldId}
                </Text>
            }
        >
            <Button
                data-dashboard-filter-control
                size="xs"
                data-disabled
                style={{ borderRadius: '100px' }}
                leftSection={
                    <MantineIcon icon={IconAlertTriangle} color="red.6" />
                }
                rightSection={
                    isEditMode && (
                        <ActionIcon
                            onClick={onRemove}
                            size="xs"
                            color="dark"
                            radius="xl"
                        >
                            <MantineIcon size="sm" icon={IconX} />
                        </ActionIcon>
                    )
                }
            >
                {getUiString('filters.invalidFilter')}
            </Button>
        </Tooltip>
    );
};

export default InvalidFilter;
