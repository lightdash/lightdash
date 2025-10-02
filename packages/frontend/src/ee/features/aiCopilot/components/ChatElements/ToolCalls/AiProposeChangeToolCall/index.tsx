import { type ToolProposeChangeArgs } from '@lightdash/common';
import { Badge, type DefaultMantineColor, Group, Stack } from '@mantine-8/core';
import { IconGitBranch } from '@tabler/icons-react';
import { ToolCallPaper } from '../ToolCallPaper';
import { ChangeRenderer } from './ChangeRenderer';

interface Props
    extends Pick<ToolProposeChangeArgs, 'change' | 'entityTableName'> {
    defaultOpened?: boolean;
}

const CHANGE_COLORS = {
    update: 'blue',
    create: 'green',
} as const satisfies Record<'update' | 'create', DefaultMantineColor>;

export const AiProposeChangeToolCall = ({
    change,
    entityTableName,
    defaultOpened = true,
}: Props) => {
    const changeType = change.value.type;
    const changeColor: DefaultMantineColor =
        CHANGE_COLORS[changeType] ?? 'gray';

    return (
        <ToolCallPaper
            defaultOpened={defaultOpened}
            icon={IconGitBranch}
            title={
                <Group gap="xs">
                    <span>Semantic Layer changes</span>
                    <Badge
                        radius="sm"
                        size="sm"
                        variant="light"
                        color={changeColor}
                    >
                        {changeType}
                    </Badge>
                </Group>
            }
        >
            <Stack gap="xs" mt="xs">
                <ChangeRenderer
                    change={change}
                    entityTableName={entityTableName}
                />

                {/*TODO
                <Group w="100%" justify="flex-end">
                    <Button
                        variant="outline"
                        size="xs"
                        color="dark"
                        leftSection={<MantineIcon icon={IconX} size={14} />}
                    >
                        Reject
                    </Button>
                </Group>*/}
            </Stack>
        </ToolCallPaper>
    );
};
