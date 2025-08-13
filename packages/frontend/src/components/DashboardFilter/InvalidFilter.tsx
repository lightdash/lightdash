import { type DashboardFilterRule } from '@lightdash/common';
import {
    Button,
    CloseButton,
    MantineProvider,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { getMantine8ThemeOverride } from '../../mantine8Theme';
import MantineIcon from '../common/MantineIcon';

type Props = {
    isEditMode: boolean;
    filterRule: DashboardFilterRule;
    onRemove?: () => void;
};

const InvalidFilter: FC<Props> = ({ isEditMode, filterRule, onRemove }) => {
    const theme = useMantineTheme();
    return (
        <MantineProvider theme={getMantine8ThemeOverride()}>
            <Tooltip
                position="top-start"
                withinPortal
                offset={0}
                arrowOffset={16}
                label={
                    <Text span>
                        <Text span c="gray.6">
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
                    leftSection={
                        <MantineIcon
                            icon={IconAlertTriangle}
                            color="red.6"
                            style={{ color: theme.colors.red[6] }}
                        />
                    }
                    style={{
                        pointerEvents: 'all',
                    }}
                    rightSection={
                        isEditMode && (
                            <CloseButton size="sm" onClick={onRemove} />
                        )
                    }
                >
                    <Text fz="inherit">
                        <Text fw={600} span fz="inherit">
                            Invalid filter
                        </Text>
                    </Text>
                </Button>
            </Tooltip>
        </MantineProvider>
    );
};

export default InvalidFilter;
