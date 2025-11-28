import {
    type ToolDashboardArgsTransformed,
    type ToolDashboardV2ArgsTransformed,
} from '@lightdash/common';
import { Group, Stack, Text, Tooltip } from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';

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
                    Built{' '}
                    <Text span fw={500} c="ldGray.8">
                        "{title}"
                    </Text>
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
