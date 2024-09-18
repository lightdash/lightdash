import {
    Badge,
    Button,
    Group,
    HoverCard,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useClipboard, useHover } from '@mantine/hooks';
import { Editor } from '@monaco-editor/react';
import { IconCheck, IconClock } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { forwardRef } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAppSelector } from '../store/hooks';

const SqlQueryHistorySelectItem = forwardRef<
    HTMLDivElement,
    { value: string; label: string; timestamp: number; index: number }
>(
    (
        {
            label,
            timestamp,
            value,
            index,
            ...others
        }: React.ComponentPropsWithoutRef<'div'> & {
            value: string;
            label: string;
            timestamp: number;
            index: number;
        },
        ref,
    ) => {
        const { copy, copied } = useClipboard({
            timeout: 500,
        });
        const { hovered, ref: hoverRef } = useHover<HTMLButtonElement>();
        const timeAgo = useTimeAgo(new Date(timestamp));

        return (
            <Stack ref={ref} {...others} w="100%">
                <HoverCard withinPortal position="left" shadow="sm">
                    <HoverCard.Target>
                        <UnstyledButton
                            ref={hoverRef}
                            sx={(theme) => ({
                                padding: theme.spacing.xs,
                                '&:hover': {
                                    backgroundColor: theme.colors.gray[0],
                                },
                            })}
                            onClick={() => {
                                copy(value);
                            }}
                        >
                            <Group spacing="xs" lh={1} noWrap>
                                <MantineIcon
                                    icon={copied ? IconCheck : IconClock}
                                    color="gray"
                                />
                                <Text
                                    fz="xs"
                                    fw={500}
                                    w={150}
                                    color={
                                        copied
                                            ? 'green.5'
                                            : hovered
                                            ? 'indigo.7'
                                            : 'gray.8'
                                    }
                                >
                                    {copied
                                        ? 'Copied to clipboard'
                                        : hovered
                                        ? 'Click to copy'
                                        : dayjs(timestamp).format(
                                              'YYYY-MM-DD HH:mm:ss',
                                          )}
                                </Text>
                            </Group>
                        </UnstyledButton>
                    </HoverCard.Target>
                    <HoverCard.Dropdown maw={400} sx={{ overflow: 'hidden' }}>
                        <Group position="apart">
                            <Text
                                fz="xs"
                                fw={500}
                                mb="xs"
                                sx={(theme) => ({
                                    borderBottom: `1px solid ${theme.colors.gray[3]}`,
                                })}
                            >
                                {timeAgo}
                            </Text>
                        </Group>
                        <Editor
                            height={200}
                            width={400}
                            language="sql"
                            value={value}
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                contextmenu: false,
                                lineNumbers: 'off',
                                glyphMargin: false,
                                lineDecorationsWidth: 0,
                                revealHorizontalRightPadding: 0,
                                roundedSelection: false,
                            }}
                            theme="lightdash"
                        />
                    </HoverCard.Dropdown>
                </HoverCard>
            </Stack>
        );
    },
);

export const SqlQueryHistorySelect = () => {
    const sqlPastHistory = useAppSelector((state) =>
        state.sqlRunner.successfulSqlQueries.past.filter(
            (item) => !!item.value,
        ),
    );

    if (!sqlPastHistory || sqlPastHistory.length === 0) {
        return null;
    }

    return (
        <Popover withinPortal>
            <Popover.Target>
                <Button
                    size="xs"
                    variant="default"
                    leftIcon={
                        <Badge size="xs" radius="xl">
                            {sqlPastHistory.length}
                        </Badge>
                    }
                >
                    SQL Query history
                </Button>
            </Popover.Target>
            <Popover.Dropdown p={0}>
                <Stack spacing="one">
                    {sqlPastHistory.map((item, index) => (
                        <SqlQueryHistorySelectItem
                            key={item.value}
                            value={item.value}
                            label={item.value}
                            timestamp={item.timestamp}
                            index={index}
                        />
                    ))}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
