import {
    ActionIcon,
    Button,
    Code,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useTimeout } from '@mantine/hooks';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useRef, useState, type FC, type RefObject } from 'react';
import MantineIcon from '../common/MantineIcon';
import { describeEgressIps, useEgressIps } from './useEgressIpCheckpoint';

type CopyState = 'idle' | 'copied' | 'selected';

const selectText = (element: HTMLElement | null) => {
    const selection = window.getSelection();
    if (!element || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
};

const useCopyWithFallback = (
    value: string,
    fallbackTarget: RefObject<HTMLElement | null>,
) => {
    const [state, setState] = useState<CopyState>('idle');
    const { start } = useTimeout(() => setState('idle'), 2000);

    const show = (next: CopyState) => {
        setState(next);
        start();
    };

    const selectInstead = () => {
        selectText(fallbackTarget.current);
        show('selected');
    };

    const copy = () => {
        if (!navigator.clipboard) {
            selectInstead();
            return;
        }
        navigator.clipboard
            .writeText(value)
            .then(() => show('copied'), selectInstead);
    };

    return { state, copy };
};

const tooltipLabel = (state: CopyState, idleLabel: string) => {
    if (state === 'copied') return 'Copied';
    if (state === 'selected') return 'Selected. Press Ctrl+C or Cmd+C';
    return idleLabel;
};

const CopyIpRow: FC<{ ip: string }> = ({ ip }) => {
    const ipRef = useRef<HTMLElement>(null);
    const { state, copy } = useCopyWithFallback(ip, ipRef);
    const label = `Copy ${ip}`;

    return (
        <Group gap={4} wrap="nowrap">
            <Code ref={ipRef}>{ip}</Code>
            <Tooltip label={tooltipLabel(state, label)}>
                <ActionIcon
                    size="sm"
                    color={state === 'copied' ? 'teal' : undefined}
                    aria-label={label}
                    onClick={copy}
                >
                    <MantineIcon
                        icon={state === 'copied' ? IconCheck : IconCopy}
                    />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
};

const CopyAllButton: FC<{
    ips: string[];
    listRef: RefObject<HTMLDivElement | null>;
}> = ({ ips, listRef }) => {
    const { state, copy } = useCopyWithFallback(ips.join(', '), listRef);

    return (
        <Tooltip
            label={tooltipLabel(state, 'Copy all IP addresses')}
            disabled={state === 'idle'}
        >
            <Button
                variant="subtle"
                size="compact-xs"
                color={state === 'copied' ? 'teal' : undefined}
                leftSection={
                    <MantineIcon
                        icon={state === 'copied' ? IconCheck : IconCopy}
                    />
                }
                onClick={copy}
                w="fit-content"
            >
                Copy all
            </Button>
        </Tooltip>
    );
};

export const EgressIpList: FC<{ ips: string[] }> = ({ ips }) => {
    const listRef = useRef<HTMLDivElement>(null);

    return (
        <Stack gap="xs">
            <Stack gap={4} ref={listRef}>
                {ips.map((ip) => (
                    <CopyIpRow key={ip} ip={ip} />
                ))}
            </Stack>
            {ips.length > 1 && <CopyAllButton ips={ips} listRef={listRef} />}
        </Stack>
    );
};

export const EgressIpNotice: FC = () => {
    const ips = useEgressIps();
    if (ips.length === 0) return null;
    const { noun, pronoun } = describeEgressIps(ips.length);

    return (
        <Stack gap="xs">
            <Text size="sm" c="dimmed">
                Lightdash connects to your warehouse from {noun}. Add {pronoun}{' '}
                to your firewall or allowlist.
            </Text>
            <EgressIpList ips={ips} />
        </Stack>
    );
};
