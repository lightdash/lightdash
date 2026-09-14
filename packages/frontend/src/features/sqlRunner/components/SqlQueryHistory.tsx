import {
    ActionIcon,
    Group,
    Stack,
    Text,
    UnstyledButton,
    HoverCard,
    Popover,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import {
    IconClock,
    IconCornerDownLeft,
    IconHistory,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { Editor } from '../../../components/MonacoEditor';
import { useEditorTheme } from '../../../hooks/useEditorTheme';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql } from '../store/sqlRunnerSlice';
import styles from './SqlQueryHistory.module.css';

type Props = {
    sql: string;

    timestamp: number;
};

const SqlQueryHistoryItem: FC<Props> = ({ timestamp, sql }) => {
    const { monaco: monacoTheme } = useEditorTheme();
    const dispatch = useAppDispatch();

    const { hovered, ref: hoverRef } = useHover<HTMLButtonElement>();
    const timeAgo = useTimeAgo(new Date(timestamp));

    const formattedDate = dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');

    return (
        <Stack w="100%">
            <HoverCard position="left">
                <HoverCard.Target>
                    <UnstyledButton
                        data-testid="sql-query-history-item"
                        ref={hoverRef}
                        className={styles.historyItem}
                        onClick={() => {
                            dispatch(setSql(sql));
                        }}
                    >
                        <Group gap="xs" lh={1} wrap="nowrap">
                            <MantineIcon
                                icon={hovered ? IconCornerDownLeft : IconClock}
                            />
                            <Text
                                fz="xs"
                                fw={500}
                                w={150}
                                c={
                                    hovered
                                        ? 'var(--mantine-color-indigo-light-color)'
                                        : 'ldGray.8'
                                }
                            >
                                {hovered
                                    ? 'Open in query editor'
                                    : formattedDate}
                            </Text>
                        </Group>
                    </UnstyledButton>
                </HoverCard.Target>
                <HoverCard.Dropdown
                    maw={600}
                    className={styles.historyDropdown}
                >
                    <Group justify="space-between">
                        <Text
                            fz="xs"
                            fw={500}
                            mb="xs"
                            style={{
                                borderBottom:
                                    '1px solid var(--mantine-color-ldGray-3)',
                            }}
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
                        theme={monacoTheme}
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
        <Popover>
            <Popover.Target>
                <Tooltip label="SQL Query history">
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
                <Stack gap="one">
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
