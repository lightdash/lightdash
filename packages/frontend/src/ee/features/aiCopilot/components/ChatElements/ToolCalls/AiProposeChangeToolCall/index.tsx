import { type ToolProposeChangeArgs } from '@lightdash/common';
import {
    Badge,
    Collapse,
    type DefaultMantineColor,
    Group,
    Paper,
    Stack,
    Title,
    UnstyledButton,
} from '@mantine-8/core';
import { IconGitBranch, IconSelector } from '@tabler/icons-react';

import { useDisclosure } from '@mantine-8/hooks';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { ChangeRenderer } from './ChangeRenderer';

interface Props
    extends Pick<ToolProposeChangeArgs, 'change' | 'entityTableName'> {
    defaultOpened?: boolean;
}

const CHANGE_COLORS = {
    update: 'blue',
} as const satisfies Record<'update', DefaultMantineColor>;

export const AiProposeChangeToolCall = ({
    change,
    entityTableName,
    defaultOpened = true,
}: Props) => {
    const changeType = change.value.type;
    const changeColor: DefaultMantineColor =
        CHANGE_COLORS[changeType] ?? 'gray';
    const [containerExpanded, { toggle }] = useDisclosure(defaultOpened);

    return (
        <Paper withBorder p="xs" radius="md">
            <UnstyledButton onClick={toggle} w="100%" h="18px">
                <Group justify="space-between" w="100%" h="100%">
                    <Group gap="xs">
                        <MantineIcon
                            icon={IconGitBranch}
                            size="sm"
                            strokeWidth={1.2}
                            color="gray.6"
                        />
                        <Title order={6} c="gray.6" size="xs">
                            Semantic Layer changes
                        </Title>
                        <Badge
                            radius="sm"
                            size="sm"
                            variant="light"
                            color={changeColor}
                        >
                            {changeType}
                        </Badge>
                    </Group>
                    <MantineIcon icon={IconSelector} size={12} color="gray.6" />
                </Group>
            </UnstyledButton>

            <Collapse in={containerExpanded}>
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
            </Collapse>
        </Paper>
    );
};
