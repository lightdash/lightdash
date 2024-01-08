import { DashboardFilterRule } from '@lightdash/common';
import {
    Button,
    CloseButton,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    isEditMode: boolean;
    filterRule: DashboardFilterRule;
    onRemove?: () => void;
};

const InvalidFilter: FC<Props> = ({ isEditMode, filterRule, onRemove }) => {
    const theme = useMantineTheme();
    return (
        <Tooltip
            position="top-start"
            withinPortal
            offset={0}
            arrowOffset={16}
            label={
                <Text span>
                    <Text span color="gray.6">
                        Tried to reference field with unknown id:
                    </Text>
                    <Text span> {filterRule.target.fieldId}</Text>
                </Text>
            }
        >
            <Button
                size="xs"
                variant="default"
                data-disabled
                leftIcon={
                    <MantineIcon
                        icon={IconAlertTriangle}
                        color="red.6"
                        style={{ color: theme.colors.red[6] }}
                    />
                }
                sx={{
                    '&[data-disabled="true"]': {
                        pointerEvents: 'all',
                    },
                }}
                rightIcon={
                    isEditMode && <CloseButton size="sm" onClick={onRemove} />
                }
            >
                <Text fz="xs">
                    <Text fw={600} span>
                        Invalid filter
                    </Text>
                </Text>
            </Button>
        </Tooltip>
    );
};

export default InvalidFilter;
