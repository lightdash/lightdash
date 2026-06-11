import {
    type ToolDashboardArgsTransformed,
    type ToolDashboardV2ArgsTransformed,
} from '@lightdash/common';
import { Group, rem, Stack, Text, Tooltip } from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { ToolCallChip } from '../ToolCallChip';

type DashboardToolCallDescriptionProps = Pick<
    ToolDashboardV2ArgsTransformed | ToolDashboardArgsTransformed,
    'title' | 'description'
>;

export const DashboardToolCallDescription: FC<
    DashboardToolCallDescriptionProps
> = ({ title, description }) => {
    return (
        <Stack gap="xs">
            <Group gap="two">
                <Text c="dimmed" size="xs">
                    Built <ToolCallChip mx={rem(2)}>{title}</ToolCallChip>
                </Text>
                {description && (
                    <Tooltip label={description}>
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="ldGray.6"
                            size="sm"
                        />
                    </Tooltip>
                )}
            </Group>
        </Stack>
    );
};
