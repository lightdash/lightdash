import {
    ContentType,
    contentToResourceViewItem,
    type HomepageResourceItem,
    type SummaryContent,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Group,
    Loader,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconAppWindow, IconSearch } from '@tabler/icons-react';
import { useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';
import { dataAppHref } from '../../../../features/apps/utils/appUrls';
import { useInfiniteContent } from '../../../../hooks/useContent';
import classes from './blockStyles.module.css';

const PAGE_SIZE = 50;

/** Build a resource item from a picked data app. Thumbnails aren't baked in —
 * they're fetched live at render time from `appUuid` (see ResourcesBlock). */
const dataAppToResourceItem = (
    projectUuid: string,
    content: SummaryContent,
): HomepageResourceItem => ({
    kind: 'data-app',
    appUuid: content.uuid,
    url: dataAppHref(projectUuid, content.uuid),
    title: content.name,
    ...(content.description ? { description: content.description } : {}),
});

const AppRow: FC<{
    content: SummaryContent;
    checked: boolean;
    alreadyAdded: boolean;
    onToggle: () => void;
}> = ({ content, checked, alreadyAdded, onToggle }) => {
    const { t } = useTranslation('homepageBuilder');
    return (
        <Group
            gap="sm"
            wrap="nowrap"
            className={classes.pickerRow}
            onClick={alreadyAdded ? undefined : onToggle}
            data-disabled={alreadyAdded || undefined}
        >
            <Checkbox size="xs" checked={checked || alreadyAdded} readOnly />
            <ResourceIcon item={contentToResourceViewItem(content)} />
            <Text size="sm" truncate flex={1}>
                {content.name}
            </Text>
            {alreadyAdded && (
                <Text size="xs" c="dimmed">
                    {t('dataAppPicker.added')}
                </Text>
            )}
        </Group>
    );
};

const DataAppPicker: FC<{
    projectUuid: string;
    existingAppUuids: string[];
    onApply: (items: HomepageResourceItem[]) => void;
    /** Hands the modal footer's Add button a callback that commits the current
     * selection — the footer lives in MantineModal, outside this component. */
    registerApply: (commit: () => void) => void;
}> = ({ projectUuid, existingAppUuids, onApply, registerApply }) => {
    const { t } = useTranslation('homepageBuilder');
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [selected, setSelected] = useState<Map<string, SummaryContent>>(
        new Map(),
    );

    // Re-point the parent's apply ref every render so it always commits the
    // latest selection (idempotent, so safe during render — no effect needed).
    registerApply(() =>
        onApply(
            [...selected.values()].map((content) =>
                dataAppToResourceItem(projectUuid, content),
            ),
        ),
    );

    const {
        data,
        isInitialLoading,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useInfiniteContent(
        {
            projectUuids: [projectUuid],
            contentTypes: [ContentType.DATA_APP],
            dataAppVizsFilter: 'exclude',
            pageSize: PAGE_SIZE,
            search: debouncedSearch || undefined,
        },
        { keepPreviousData: true },
    );

    const apps = useMemo(
        () => (data?.pages ?? []).flatMap((page) => page.data),
        [data],
    );
    const existing = useMemo(
        () => new Set(existingAppUuids),
        [existingAppUuids],
    );

    const toggle = (content: SummaryContent) =>
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(content.uuid)) next.delete(content.uuid);
            else next.set(content.uuid, content);
            return next;
        });

    return (
        <Stack gap="sm">
            <TextInput
                size="xs"
                placeholder={t('dataAppPicker.search')}
                leftSection={<MantineIcon icon={IconSearch} size={14} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                autoFocus
            />
            <Box h="min(56vh, 560px)" className={classes.pickerScrollList}>
                {isInitialLoading ? (
                    <Group justify="center" p="md">
                        <Loader size="sm" />
                    </Group>
                ) : apps.length === 0 ? (
                    <Text size="sm" c="dimmed" p="sm">
                        {t('dataAppPicker.empty')}
                    </Text>
                ) : (
                    <Stack gap={2}>
                        {apps.map((content) => (
                            <AppRow
                                key={content.uuid}
                                content={content}
                                checked={selected.has(content.uuid)}
                                alreadyAdded={existing.has(content.uuid)}
                                onToggle={() => toggle(content)}
                            />
                        ))}
                        {hasNextPage && (
                            <Button
                                variant="subtle"
                                size="xs"
                                w="fit-content"
                                loading={isFetchingNextPage}
                                onClick={() => void fetchNextPage()}
                            >
                                {t('dataAppPicker.loadMore')}
                            </Button>
                        )}
                    </Stack>
                )}
            </Box>
        </Stack>
    );
};

export const DataAppPickerModal: FC<{
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    existingAppUuids: string[];
    onAdd: (items: HomepageResourceItem[]) => void;
}> = ({ opened, onClose, projectUuid, existingAppUuids, onAdd }) => {
    const { t } = useTranslation('homepageBuilder');
    // The Add/Cancel footer is MantineModal's own — it lives outside the
    // remountable picker body, so the picker hands its commit fn up via ref.
    const applyRef = useRef<() => void>(() => {});
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('dataAppPicker.title')}
            icon={IconAppWindow}
            size="lg"
            confirmLabel={t('actions.add', { ns: 'common' })}
            onConfirm={() => {
                applyRef.current();
                onClose();
            }}
        >
            {opened && (
                <DataAppPicker
                    projectUuid={projectUuid}
                    existingAppUuids={existingAppUuids}
                    onApply={onAdd}
                    registerApply={(fn) => {
                        applyRef.current = fn;
                    }}
                />
            )}
        </MantineModal>
    );
};
