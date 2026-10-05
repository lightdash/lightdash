import {
    Box,
    Button,
    Code,
    Group,
    Input,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useTimeout } from '@mantine/hooks';
import { useRef, useState, type FC, type RefObject } from 'react';
import { describeEgressIps, useEgressIps } from './useEgressIps';

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

    return (
        <Tooltip label={tooltipLabel(state, 'Copy to clipboard')}>
            <UnstyledButton aria-label={`Copy ${ip}`} onClick={copy}>
                <Code ref={ipRef} c={state === 'copied' ? 'teal' : undefined}>
                    {ip}
                </Code>
            </UnstyledButton>
        </Tooltip>
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
                onClick={copy}
                w="fit-content"
            >
                Copy all
            </Button>
        </Tooltip>
    );
};

const EgressIpList: FC<{ ips: string[] }> = ({ ips }) => {
    const listRef = useRef<HTMLDivElement>(null);

    return (
        <Group gap="md" wrap="wrap">
            <Group gap="md" wrap="wrap" ref={listRef}>
                {ips.map((ip) => (
                    <CopyIpRow key={ip} ip={ip} />
                ))}
            </Group>
            {ips.length > 1 && <CopyAllButton ips={ips} listRef={listRef} />}
        </Group>
    );
};

export const EgressIpNotice: FC = () => {
    const ips = useEgressIps();
    if (ips.length === 0) return null;
    const { noun, pronoun } = describeEgressIps(ips.length);

    return (
        <Input.Wrapper
            label={`Lightdash ${noun}`}
            description={`Lightdash connects to your warehouse from this instance's ${noun}. Add ${pronoun} to your firewall or allowlist.`}
            mt="sm"
        >
            <Box mt={6}>
                <EgressIpList ips={ips} />
            </Box>
        </Input.Wrapper>
    );
};
