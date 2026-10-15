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
import { type TFunction } from 'i18next';
import { useRef, useState, type FC, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useEgressIps } from './useEgressIps';

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

const tooltipLabel = (t: TFunction, state: CopyState, idleLabel: string) => {
    if (state === 'copied') return t('egressIp.copied');
    if (state === 'selected') return t('egressIp.selected');
    return idleLabel;
};

const CopyIpRow: FC<{ ip: string }> = ({ ip }) => {
    const { t } = useTranslation('projectConnection');
    const ipRef = useRef<HTMLElement>(null);
    const { state, copy } = useCopyWithFallback(ip, ipRef);

    return (
        <Tooltip label={tooltipLabel(t, state, t('egressIp.copyToClipboard'))}>
            <UnstyledButton
                aria-label={t('egressIp.copyIp', { ip })}
                onClick={copy}
            >
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
    const { t } = useTranslation('projectConnection');
    const { state, copy } = useCopyWithFallback(ips.join(', '), listRef);

    return (
        <Tooltip
            label={tooltipLabel(t, state, t('egressIp.copyAllTooltip'))}
            disabled={state === 'idle'}
        >
            <Button
                variant="subtle"
                size="compact-xs"
                color={state === 'copied' ? 'teal' : undefined}
                onClick={copy}
                w="fit-content"
            >
                {t('egressIp.copyAll')}
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
    const { t } = useTranslation('projectConnection');
    const ips = useEgressIps();
    if (ips.length === 0) return null;

    return (
        <Input.Wrapper
            label={t('egressIp.label', { count: ips.length })}
            description={t('egressIp.description', { count: ips.length })}
            mt="sm"
        >
            <Box mt={6}>
                <EgressIpList ips={ips} />
            </Box>
        </Input.Wrapper>
    );
};
