import {
    QueryHistoryStatus,
    QueryLanguage,
    type QueryHistoryListItem,
} from '@lightdash/common'; // pragma: allowlist secret
import { Badge, Group, Stack } from '@mantine/core';
import { type FC } from 'react';
import TruncatedText from '../../../components/common/TruncatedText';
import styles from '../QueryHistory.module.css';

const isRunning = (status: QueryHistoryStatus) =>
    status === QueryHistoryStatus.PENDING ||
    status === QueryHistoryStatus.QUEUED ||
    status === QueryHistoryStatus.EXECUTING;

type Props = {
    item: QueryHistoryListItem;
};

export const QueryHistoryQueryCell: FC<Props> = ({ item }) => {
    const running = isRunning(item.status);
    const failed = item.status === QueryHistoryStatus.ERROR;
    const sublineIsMono = item.language === QueryLanguage.SQL || failed;

    return (
        <Stack gap={2}>
            <Group gap="xs" wrap="nowrap">
                <TruncatedText maxWidth="100%" fw={600} fz="sm">
                    {item.title}
                </TruncatedText>
                {running ? (
                    <Badge size="xs" tt="uppercase" className="ld-shrink-0">
                        <span className={styles.pulseDot} />
                        running
                    </Badge>
                ) : null}
                {failed ? (
                    <Badge
                        size="xs"
                        tt="uppercase"
                        color="red"
                        className="ld-shrink-0"
                    >
                        failed
                    </Badge>
                ) : null}
                {!running && !failed && item.cacheHit ? (
                    <Badge size="xs" tt="uppercase" className="ld-shrink-0">
                        cached
                    </Badge>
                ) : null}
            </Group>
            {item.subline ? (
                <TruncatedText
                    maxWidth="100%"
                    fz="xs"
                    c="dimmed"
                    ff={sublineIsMono ? 'monospace' : undefined}
                >
                    {item.subline}
                </TruncatedText>
            ) : null}
        </Stack>
    );
};
