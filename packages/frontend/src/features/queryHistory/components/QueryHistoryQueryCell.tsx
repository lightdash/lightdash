import {
    QueryHistoryStatus,
    QueryLanguage,
    type QueryHistoryListItem,
} from '@lightdash/common';
import { Badge, Box, Group, Loader, Stack, Tooltip } from '@mantine/core';
import { IconBolt } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import TruncatedText from '../../../components/common/TruncatedText';
import { isRunningStatus } from '../utils/format';

export const QueryStatusBadge: FC<{ status: QueryHistoryStatus }> = ({
    status,
}) => {
    if (isRunningStatus(status)) {
        return (
            <Badge
                size="xs"
                className="ld-shrink-0"
                leftSection={<Loader size={8} color="gray" />}
            >
                Running
            </Badge>
        );
    }
    switch (status) {
        case QueryHistoryStatus.ERROR:
            return (
                <Badge size="xs" color="red" className="ld-shrink-0">
                    Failed
                </Badge>
            );
        case QueryHistoryStatus.CANCELLED:
            return (
                <Badge size="xs" className="ld-shrink-0">
                    Cancelled
                </Badge>
            );
        case QueryHistoryStatus.EXPIRED:
            return (
                <Badge size="xs" className="ld-shrink-0">
                    Expired
                </Badge>
            );
        default:
            return null;
    }
};

type Props = {
    item: QueryHistoryListItem;
};

export const QueryHistoryQueryCell: FC<Props> = ({ item }) => {
    const failed = item.status === QueryHistoryStatus.ERROR;
    const sublineIsMono = item.language === QueryLanguage.SQL || failed;
    const servedFromCache =
        item.cacheHit && item.status === QueryHistoryStatus.READY;

    return (
        <Stack gap={2} miw={0}>
            <Group gap="xs" wrap="nowrap" miw={0}>
                <TruncatedText maxWidth="100%" fw={500}>
                    {item.title}
                </TruncatedText>
                <QueryStatusBadge status={item.status} />
                {servedFromCache ? (
                    <Tooltip label="Served from cache">
                        <Box
                            component="span"
                            display="inline-flex"
                            className="ld-shrink-0"
                        >
                            <MantineIcon
                                icon={IconBolt}
                                size="sm"
                                color="dimmed"
                            />
                        </Box>
                    </Tooltip>
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
