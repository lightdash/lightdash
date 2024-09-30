import {
    ActionIcon,
    Group,
    HoverCard,
    Popover,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { Editor } from '@monaco-editor/react';
import {
    IconClock,
    IconCornerDownLeft,
    IconHistory,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql } from '../store/sqlRunnerSlice';

type Props = {
    sql: string;

    timestamp: number;
};

const SqlQueryHistoryItem: FC<Props> = ({ timestamp, sql }) => {
    const dispatch = useAppDispatch();

    const { hovered, ref: hoverRef } = useHover<HTMLButtonElement>();
    const timeAgo = useTimeAgo(new Date(timestamp));

    const formattedDate = dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');

    return (
        <Stack w="100%">
            <HoverCard withinPortal position="left" shadow="sm">
                <HoverCard.Target>
                    <UnstyledButton
                        data-testid="sql-query-history-item"
                        ref={hoverRef}
                        sx={(theme) => ({
                            padding: theme.spacing.xs,
                            '&:hover': {
                                backgroundColor: theme.colors.gray[0],
                            },
                        })}
                        onClick={() => {
                            dispatch(setSql(sql));
                        }}
                    >
                        <Group spacing="xs" lh={1} noWrap>
                            <MantineIcon
                                icon={hovered ? IconCornerDownLeft : IconClock}
                                color="gray"
                            />
                            <Text
                                fz="xs"
                                fw={500}
                                w={150}
                                color={hovered ? 'indigo.7' : 'gray.8'}
                            >
                                {hovered
                                    ? 'Open in query editor'
                                    : formattedDate}
                            </Text>
                        </Group>
                    </UnstyledButton>
                </HoverCard.Target>
                <HoverCard.Dropdown maw={600} sx={{ overflow: 'scroll' }}>
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
                        height={400}
                        width={600}
                        language="sql"
                        value={sql}
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
};

export const SqlQueryHistory: FC = () => {
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
                <Tooltip variant="xs" label="SQL Query history">
                    <ActionIcon
                        variant="default"
                        size={32}
                        data-testid="sql-query-history-button"
                    >
                        <MantineIcon icon={IconHistory} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p={0}>
                <Stack spacing="one">
                    {sqlPastHistory.map((item) => (
                        <SqlQueryHistoryItem
                            key={item.value}
                            sql={item.value}
                            timestamp={item.timestamp}
                        />
                    ))}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
