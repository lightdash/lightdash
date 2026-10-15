import { Anchor, Button, Menu, Stack, Tooltip } from '@mantine/core';
import { IconArrowUpRight, IconBrandSlack } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import { RoadmapRailRow } from './RoadmapDetails';
import styles from './RoadmapDetails.module.css';

type Props = { urls: string[] };

const threadLabel = (t: TFunction, count: number, index: number) =>
    count === 1
        ? t('roadmap.slack.viewThread')
        : t('roadmap.slack.threadNumber', { number: index + 1 });

export function RoadmapSlackThreads({ urls }: Props) {
    const { t } = useTranslation('eeMisc');
    if (urls.length === 0) return null;

    if (urls.length === 1) {
        return (
            <Tooltip label={t('roadmap.slack.viewThread')}>
                <Anchor
                    href={urls[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('roadmap.slack.viewThread')}
                    className={styles.detailRailLink}
                >
                    <MantineIcon icon={IconBrandSlack} size={14} />
                </Anchor>
            </Tooltip>
        );
    }

    return (
        <Menu withinPortal position="bottom-end">
            <Menu.Target>
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    px={4}
                    leftSection={
                        <MantineIcon icon={IconBrandSlack} size={14} />
                    }
                    aria-label={t('roadmap.slack.viewThreads', {
                        count: urls.length,
                    })}
                >
                    {urls.length}
                </Button>
            </Menu.Target>
            <Menu.Dropdown mah={240} style={{ overflowY: 'auto' }}>
                {urls.map((url, index) => (
                    <Menu.Item
                        key={url}
                        component="a"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        leftSection={
                            <MantineIcon icon={IconBrandSlack} size={14} />
                        }
                        rightSection={
                            <MantineIcon icon={IconArrowUpRight} size={13} />
                        }
                    >
                        {threadLabel(t, urls.length, index)}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}

export function RoadmapSlackThreadsRow({ urls }: Props) {
    const { t } = useTranslation('eeMisc');
    if (urls.length === 0) return null;

    return (
        <RoadmapRailRow label={t('roadmap.slack.threads')} align="flex-start">
            <Stack gap={6}>
                {urls.map((url, index) => (
                    <Anchor
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.detailRailLink}
                    >
                        <MantineIcon icon={IconBrandSlack} size={14} />
                        {threadLabel(t, urls.length, index)}
                        <MantineIcon icon={IconArrowUpRight} size={13} />
                    </Anchor>
                ))}
            </Stack>
        </RoadmapRailRow>
    );
}
