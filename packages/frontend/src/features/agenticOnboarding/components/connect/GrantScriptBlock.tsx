import { Anchor, Group, Stack, Text } from '@mantine-8/core';
import { IconShare } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import CopyScriptBlock from './CopyScriptBlock';

type GrantScriptBlockProps = {
    sql: string;
};

const buildMailto = (sql: string): string => {
    const subject = encodeURIComponent(
        'Run this read-only GRANT for our Lightdash connection',
    );
    const body = encodeURIComponent(
        `Hi,\n\nCould you run this read-only GRANT script in Snowflake so we can connect Lightdash? It only grants read access and can be revoked at any time.\n\n${sql}\n\nThanks!`,
    );
    return `mailto:?subject=${subject}&body=${body}`;
};

const GrantScriptBlock: FC<GrantScriptBlockProps> = ({ sql }) => (
    <Stack gap="xs">
        <CopyScriptBlock script={sql} aria-label="Grant script" />
        <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed">
                Read-only access — revocable at any time.
            </Text>
            <Anchor
                href={buildMailto(sql)}
                size="sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
                <MantineIcon icon={IconShare} size="sm" />
                Share with a teammate
            </Anchor>
        </Group>
    </Stack>
);

export default GrantScriptBlock;
