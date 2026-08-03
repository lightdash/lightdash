import {
    type HomepageResourceItem,
    type HomepageResourceKind,
    type HomepageResourcesLayout,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconAppWindow,
    IconBook,
    IconBrandYoutube,
    IconExternalLink,
    IconLayoutGrid,
    IconLayoutList,
    IconLink,
    IconPlus,
    IconSparkles,
    IconTrash,
    IconVideo,
    type Icon,
} from '@tabler/icons-react';
import {
    useEffect,
    useRef,
    useState,
    type ClipboardEvent,
    type FC,
    type KeyboardEvent,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppThumbnailUrl } from '../../../../features/apps/hooks/useAppThumbnail';
import { BlockHeader, IconSquare, MiniPill } from './BlockShell';
import classes from './blockStyles.module.css';
import { DataAppPickerModal } from './DataAppPickerModal';
import { PageGrid, PageGridItem } from './PageGrid';
import {
    dataAppHref,
    faviconUrl,
    hostnameOf,
    looksLikeUrl,
    resolveResourceUrl,
    safeImageUrl,
} from './resourceUrls';
import { type BlockComponentProps, type BuildComponentProps } from './types';

// `thumbAccent` is the kind-tinted wash behind a bare favicon: it exists so an
// external link's kind is legible when there's no image to show. Internal
// content carries its own icon language and takes no tint — see DataAppCardMedia.
const KIND_META: Record<
    HomepageResourceKind,
    { icon: Icon; label: string; thumbAccent?: string }
> = {
    video: {
        icon: IconVideo,
        label: 'Video',
        thumbAccent: classes.resThumbVideo,
    },
    doc: { icon: IconBook, label: 'Doc', thumbAccent: classes.resThumbDoc },
    link: { icon: IconLink, label: 'Link', thumbAccent: classes.resThumbLink },
    claude: {
        icon: IconSparkles,
        label: 'Claude',
        thumbAccent: classes.resThumbClaude,
    },
    youtube: {
        icon: IconBrandYoutube,
        label: 'YouTube',
        thumbAccent: classes.resThumbYoutube,
    },
    'data-app': { icon: IconAppWindow, label: 'Data app' },
};

// Data apps are added via the picker, not the kind dropdown, so they're
// excluded from the manually-selectable kinds.
const KIND_OPTIONS = (Object.keys(KIND_META) as HomepageResourceKind[])
    .filter((kind) => kind !== 'data-app')
    .map((kind) => ({ value: kind, label: KIND_META[kind].label }));

const kindMeta = (kind: HomepageResourceKind) =>
    KIND_META[kind] ?? KIND_META.link;

// Google's favicon service never 404s: sites with no favicon get its default
// globe, served at 16px however large we ask. Detect it by size and fall back
// to our own kind glyph instead of showing the blurry globe.
const isDefaultFavicon = (img: HTMLImageElement) => img.naturalWidth < 32;

// --- Thumbnails -------------------------------------------------------------

// The media slot for a data app card: its screenshot when there is one,
// otherwise the neutral icon square native content uses (see ContentCard) —
// never a full-size coloured placeholder. A fallback should be quieter than
// the real thing, not louder. Kind stays legible in text on the card body.
// Shared by the published card and the editor canvas so they can't drift.
const DataAppThumb: FC<{
    item: HomepageResourceItem;
    projectUuid: string;
}> = ({ item, projectUuid }) => {
    const [failed, setFailed] = useState(false);
    const { data } = useAppThumbnailUrl(
        projectUuid,
        item.appUuid,
        !!item.appUuid,
    );
    const thumbnailUrl = failed ? undefined : data?.thumbnailUrl;
    if (!thumbnailUrl) {
        // Same neutral square a link with no favicon falls back to — no kind tint.
        return (
            <div className={classes.mediaIcon}>
                <IconSquare icon={IconAppWindow} />
            </div>
        );
    }
    return (
        <div className={classes.resThumb}>
            <img
                src={thumbnailUrl}
                alt={item.title}
                loading="lazy"
                onError={() => setFailed(true)}
            />
        </div>
    );
};

const UrlCardThumb: FC<{ item: HomepageResourceItem }> = ({ item }) => {
    const meta = kindMeta(item.kind);
    const [imgFailed, setImgFailed] = useState(false);
    const [faviconFailed, setFaviconFailed] = useState(false);
    const favicon = faviconUrl(item.url);
    const imageUrl = safeImageUrl(item.imageUrl);

    // A real per-item photo (e.g. a YouTube still) fills the frame sharply.
    // Claude's og:image is generic/soft, so it's treated as a backdrop instead.
    if (imageUrl && item.kind !== 'claude' && !imgFailed) {
        return (
            <div className={classes.resThumb}>
                <img
                    src={imageUrl}
                    alt={item.title}
                    loading="lazy"
                    onError={() => setImgFailed(true)}
                />
            </div>
        );
    }

    // No sharp photo → a quiet kind-tinted wash with the bare favicon on it.
    return (
        <div
            className={[classes.resThumbTile, meta.thumbAccent]
                .filter(Boolean)
                .join(' ')}
        >
            {favicon && !faviconFailed ? (
                <img
                    className={classes.resFavTile}
                    src={favicon}
                    alt={item.title}
                    loading="lazy"
                    onError={() => setFaviconFailed(true)}
                    onLoad={(e) => {
                        if (isDefaultFavicon(e.currentTarget))
                            setFaviconFailed(true);
                    }}
                />
            ) : (
                <div className={classes.resGlyphTile}>
                    <MantineIcon icon={meta.icon} size={22} />
                </div>
            )}
        </div>
    );
};

const CardThumb: FC<{ item: HomepageResourceItem; projectUuid: string }> = ({
    item,
    projectUuid,
}) =>
    item.kind === 'data-app' ? (
        <DataAppThumb item={item} projectUuid={projectUuid} />
    ) : (
        <UrlCardThumb item={item} />
    );

// --- Read-only presentation (published + preview) ---------------------------

// Data apps are internal links; everything else is an external resource. The
// external-link chrome (new tab, hostname fallback) only applies to the latter.
const isDataApp = (item: HomepageResourceItem) => item.kind === 'data-app';

// Data app hrefs are derived from `appUuid` rather than trusting the stored
// `url` — some already-persisted layouts contain malformed data app urls.
const itemHref = (item: HomepageResourceItem, projectUuid: string): string =>
    isDataApp(item) && item.appUuid
        ? dataAppHref(projectUuid, item.appUuid)
        : item.url;

const ResourceCard: FC<{
    item: HomepageResourceItem;
    projectUuid: string;
    standalone: boolean;
    showDescription?: boolean;
}> = ({ item, projectUuid, standalone, showDescription = true }) => {
    const dataApp = isDataApp(item);
    return (
        <a
            href={itemHref(item, projectUuid)}
            target={dataApp ? undefined : '_blank'}
            rel={dataApp ? undefined : 'noopener noreferrer'}
            className={`${classes.mediaCard} ${classes.cardUnit1} ${
                standalone ? classes.mediaCardTall : ''
            } ${classes.clickable} ${classes.plainLink}`}
        >
            {!dataApp && (
                <MantineIcon
                    icon={IconExternalLink}
                    size={13}
                    className={classes.resExternal}
                />
            )}
            <CardThumb item={item} projectUuid={projectUuid} />
            <div className={classes.mediaBody}>
                <div className={classes.mediaTitle}>
                    {item.title || hostnameOf(item.url)}
                </div>
                {showDescription && (
                    <div className={classes.mediaDesc}>
                        {item.description ||
                            (dataApp
                                ? kindMeta(item.kind).label
                                : hostnameOf(item.url))}
                    </div>
                )}
            </div>
        </a>
    );
};

// The trailing preview on a data app tile: its live screenshot when one
// exists, nothing otherwise. Data apps get opened like dashboards, so their
// tile earns a glimpse of the real thing where a link just gets an arrow.
const DataAppTilePeek: FC<{
    item: HomepageResourceItem;
    projectUuid: string;
}> = ({ item, projectUuid }) => {
    const [failed, setFailed] = useState(false);
    const { data } = useAppThumbnailUrl(
        projectUuid,
        item.appUuid,
        !!item.appUuid,
    );
    const thumbnailUrl = failed ? undefined : data?.thumbnailUrl;
    if (!thumbnailUrl) return null;
    return (
        <div className={classes.tilePeek}>
            <img
                src={thumbnailUrl}
                alt=""
                loading="lazy"
                onError={() => setFailed(true)}
            />
        </div>
    );
};

// Compact tile: the same horizontal card language native content uses —
// glyph square + name + one supporting line. The dense grid option for
// blocks where resources are destinations to reach, not media to showcase.
const ResourceTile: FC<{
    item: HomepageResourceItem;
    projectUuid: string;
    showDescription: boolean;
}> = ({ item, projectUuid, showDescription }) => {
    const dataApp = isDataApp(item);
    return (
        <a
            href={itemHref(item, projectUuid)}
            target={dataApp ? undefined : '_blank'}
            rel={dataApp ? undefined : 'noopener noreferrer'}
            className={`${classes.resTile} ${classes.clickable} ${classes.plainLink}`}
        >
            <IconSquare icon={kindMeta(item.kind).icon} />
            <div className={classes.resTileBody}>
                <div className={classes.rowName}>
                    {item.title || hostnameOf(item.url)}
                </div>
                {showDescription && (
                    <div className={classes.rowDesc}>
                        {item.description ||
                            (dataApp
                                ? kindMeta(item.kind).label
                                : hostnameOf(item.url))}
                    </div>
                )}
            </div>
            {dataApp ? (
                <DataAppTilePeek item={item} projectUuid={projectUuid} />
            ) : (
                <MantineIcon
                    icon={IconExternalLink}
                    size={14}
                    color="ldGray.4"
                />
            )}
        </a>
    );
};

export const ResourcesBlockView: FC<BlockComponentProps> = ({
    block,
    itemSpan,
    projectUuid,
    standalone = false,
}) => {
    if (block.type !== 'resources' || block.config.items.length === 0) {
        return null;
    }
    const layout: HomepageResourcesLayout = block.config.layout ?? 'list';
    const showDescriptions = block.config.showDescriptions ?? true;
    return (
        <Stack gap={0}>
            <BlockHeader icon={IconBook} title={block.config.title} />
            {layout === 'card' ? (
                <PageGrid itemSpan={itemSpan ?? null}>
                    {block.config.items.map((item, i) => (
                        <PageGridItem key={`${item.url}-${i}`}>
                            <ResourceCard
                                item={item}
                                projectUuid={projectUuid}
                                standalone={standalone}
                                showDescription={showDescriptions}
                            />
                        </PageGridItem>
                    ))}
                </PageGrid>
            ) : (
                <div className={classes.resTileGrid}>
                    {block.config.items.map((item, i) => (
                        <ResourceTile
                            key={`${item.url}-${i}`}
                            item={item}
                            projectUuid={projectUuid}
                            showDescription={showDescriptions}
                        />
                    ))}
                </div>
            )}
        </Stack>
    );
};

// --- Skeletons (in-flight paste) --------------------------------------------

const SkeletonCard: FC = () => (
    <div className={classes.mediaCard}>
        <div className={`${classes.resThumb} ${classes.skeletonBlock}`} />
        <div className={classes.mediaBody}>
            <div
                className={`${classes.skeletonLine} ${classes.skeletonKind}`}
            />
            <div className={classes.skeletonLine} />
            <div
                className={`${classes.skeletonLine} ${classes.skeletonShort}`}
            />
        </div>
    </div>
);

const SkeletonRow: FC = () => (
    <div className={classes.resTile}>
        <div className={`${classes.rowThumb} ${classes.skeletonBlock}`} />
        <div className={classes.flexFill}>
            <div className={classes.skeletonLine} />
            <div
                className={`${classes.skeletonLine} ${classes.skeletonShort} ${classes.skeletonRowSecond}`}
            />
        </div>
    </div>
);

// --- Editable build cards/rows ----------------------------------------------

type EditProps = {
    item: HomepageResourceItem;
    projectUuid: string;
    onPatch: (patch: Partial<HomepageResourceItem>) => void;
    onRemove: () => void;
};

const KindSelect: FC<{
    value: HomepageResourceKind;
    onChange: (kind: HomepageResourceKind) => void;
}> = ({ value, onChange }) => (
    <Select
        size="xs"
        w={104}
        variant="unstyled"
        data={KIND_OPTIONS}
        value={value}
        allowDeselect={false}
        onChange={(v) => v && onChange(v as HomepageResourceKind)}
        aria-label="Resource kind"
    />
);

// Data app kind is fixed (set by the picker) — show a static pill instead of
// the editable dropdown so it can't be switched to a URL-based kind.
const KindControl: FC<{
    item: HomepageResourceItem;
    onChange: (kind: HomepageResourceKind) => void;
}> = ({ item, onChange }) =>
    item.kind === 'data-app' ? (
        <MiniPill>{kindMeta(item.kind).label}</MiniPill>
    ) : (
        <KindSelect value={item.kind} onChange={onChange} />
    );

const BuildCard: FC<EditProps & { standalone: boolean }> = ({
    item,
    projectUuid,
    standalone,
    onPatch,
    onRemove,
}) => (
    <div
        className={`${classes.mediaCard} ${
            standalone ? classes.mediaCardTall : ''
        }`}
    >
        <CardThumb item={item} projectUuid={projectUuid} />
        <div className={classes.mediaBody}>
            <Group gap={4} justify="space-between" wrap="nowrap">
                <KindControl
                    item={item}
                    onChange={(kind) => onPatch({ kind })}
                />
                <ActionIcon
                    variant="subtle"
                    color="ldGray.6"
                    size="sm"
                    aria-label={`Remove ${item.title}`}
                    onClick={onRemove}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Group>
            <TextInput
                variant="unstyled"
                size="xs"
                placeholder="Title"
                value={item.title}
                className={classes.mediaTitleInput}
                onChange={(e) => onPatch({ title: e.currentTarget.value })}
            />
            <Textarea
                variant="unstyled"
                size="xs"
                autosize
                minRows={1}
                maxRows={3}
                placeholder="Description"
                value={item.description ?? ''}
                onChange={(e) =>
                    onPatch({ description: e.currentTarget.value || undefined })
                }
            />
        </div>
    </div>
);

const BuildTile: FC<EditProps> = ({ item, projectUuid, onPatch, onRemove }) => (
    <div className={classes.resTile}>
        <IconSquare icon={kindMeta(item.kind).icon} />
        <div className={classes.resTileBody}>
            <TextInput
                variant="unstyled"
                size="xs"
                placeholder="Title"
                value={item.title}
                onChange={(e) => onPatch({ title: e.currentTarget.value })}
            />
            <TextInput
                variant="unstyled"
                size="xs"
                placeholder="Description"
                value={item.description ?? ''}
                onChange={(e) =>
                    onPatch({ description: e.currentTarget.value || undefined })
                }
            />
        </div>
        {isDataApp(item) ? (
            <DataAppTilePeek item={item} projectUuid={projectUuid} />
        ) : (
            <KindControl item={item} onChange={(kind) => onPatch({ kind })} />
        )}
        <ActionIcon
            variant="subtle"
            color="ldGray.6"
            size="sm"
            aria-label={`Remove ${item.title}`}
            onClick={onRemove}
        >
            <MantineIcon icon={IconTrash} />
        </ActionIcon>
    </div>
);

// --- Build container --------------------------------------------------------

type BatchEntry = {
    key: number;
    url: string;
    item: HomepageResourceItem | null;
};

export const ResourcesBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
    itemSpan,
    standalone = false,
}) => {
    const [pasteValue, setPasteValue] = useState('');
    const [batch, setBatch] = useState<BatchEntry[]>([]);
    const [isAppPickerOpen, setIsAppPickerOpen] = useState(false);
    const keyCounter = useRef(0);

    // Flush the paste batch into config once every URL has resolved — a single
    // commit avoids racing parallel appends against a stale block snapshot.
    useEffect(() => {
        if (block.type !== 'resources') return;
        if (batch.length === 0 || batch.some((e) => e.item === null)) return;
        const resolved = batch.map((e) => e.item as HomepageResourceItem);
        onChange({
            ...block,
            config: {
                ...block.config,
                items: [...block.config.items, ...resolved],
            },
        });
        setBatch([]);
    }, [batch, block, onChange]);

    if (block.type !== 'resources') return null;
    const { items } = block.config;
    const layout: HomepageResourcesLayout = block.config.layout ?? 'list';

    const patchConfig = (patch: Partial<typeof block.config>) =>
        onChange({ ...block, config: { ...block.config, ...patch } });

    const patchItem = (index: number, patch: Partial<HomepageResourceItem>) =>
        patchConfig({
            items: items.map((it, i) =>
                i === index ? { ...it, ...patch } : it,
            ),
        });

    const removeItem = (index: number) =>
        patchConfig({ items: items.filter((_, i) => i !== index) });

    const existingAppUuids = items.flatMap((it) =>
        it.kind === 'data-app' && it.appUuid ? [it.appUuid] : [],
    );

    const addDataApps = (newItems: HomepageResourceItem[]) => {
        const known = new Set(existingAppUuids);
        const deduped = newItems.filter(
            (it) => !it.appUuid || !known.has(it.appUuid),
        );
        if (deduped.length === 0) return;
        patchConfig({ items: [...items, ...deduped] });
    };

    const startResolving = (text: string) => {
        const urls = Array.from(
            new Set(
                text
                    .split(/\s+/)
                    .map((s) => s.trim())
                    .filter(looksLikeUrl),
            ),
        );
        if (urls.length === 0) return;
        setPasteValue('');
        const entries: BatchEntry[] = urls.map((url) => {
            keyCounter.current += 1;
            return { key: keyCounter.current, url, item: null };
        });
        setBatch((prev) => [...prev, ...entries]);
        entries.forEach((entry) => {
            void resolveResourceUrl(projectUuid, entry.url).then((item) =>
                setBatch((prev) =>
                    prev.map((e) => (e.key === entry.key ? { ...e, item } : e)),
                ),
            );
        });
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text');
        if (text.trim()) {
            e.preventDefault();
            startResolving(text);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            startResolving(pasteValue);
        }
    };

    const resolvedBatch = batch.filter(
        (e): e is BatchEntry & { item: HomepageResourceItem } =>
            e.item !== null,
    );
    const pendingCount = batch.length - resolvedBatch.length;

    return (
        <Stack gap="xs">
            <Group
                justify="space-between"
                wrap="nowrap"
                gap="xs"
                align="flex-end"
            >
                <TextInput
                    label="Title"
                    size="xs"
                    fw={600}
                    flex={1}
                    value={block.config.title}
                    onChange={(e) =>
                        patchConfig({ title: e.currentTarget.value })
                    }
                />
                <SegmentedControl
                    size="xs"
                    value={layout}
                    onChange={(v) =>
                        patchConfig({ layout: v as HomepageResourcesLayout })
                    }
                    data={[
                        {
                            value: 'card',
                            label: (
                                <Tooltip label="Cards" openDelay={200}>
                                    <Box
                                        component="span"
                                        lh={0}
                                        display="inline-block"
                                    >
                                        <MantineIcon icon={IconLayoutGrid} />
                                    </Box>
                                </Tooltip>
                            ),
                        },
                        {
                            value: 'list',
                            label: (
                                <Tooltip label="Compact" openDelay={200}>
                                    <Box
                                        component="span"
                                        lh={0}
                                        display="inline-block"
                                    >
                                        <MantineIcon icon={IconLayoutList} />
                                    </Box>
                                </Tooltip>
                            ),
                        },
                    ]}
                />
            </Group>
            <Switch
                size="xs"
                label="Show descriptions"
                checked={block.config.showDescriptions ?? true}
                onChange={(e) =>
                    patchConfig({
                        showDescriptions: e.currentTarget.checked,
                    })
                }
            />

            {layout === 'card' ? (
                <PageGrid itemSpan={itemSpan ?? null}>
                    {items.map((item, i) => (
                        <PageGridItem key={`${item.url}-${i}`}>
                            <BuildCard
                                item={item}
                                projectUuid={projectUuid}
                                standalone={standalone}
                                onPatch={(patch) => patchItem(i, patch)}
                                onRemove={() => removeItem(i)}
                            />
                        </PageGridItem>
                    ))}
                    {resolvedBatch.map((e) => (
                        <PageGridItem key={e.key}>
                            <ResourceCard
                                item={e.item}
                                projectUuid={projectUuid}
                                standalone={standalone}
                            />
                        </PageGridItem>
                    ))}
                    {Array.from({ length: pendingCount }).map((_, i) => (
                        <PageGridItem key={`sk-${i}`}>
                            <SkeletonCard />
                        </PageGridItem>
                    ))}
                </PageGrid>
            ) : (
                <div className={classes.resTileGrid}>
                    {items.map((item, i) => (
                        <BuildTile
                            key={`${item.url}-${i}`}
                            item={item}
                            projectUuid={projectUuid}
                            onPatch={(patch) => patchItem(i, patch)}
                            onRemove={() => removeItem(i)}
                        />
                    ))}
                    {resolvedBatch.map((e) => (
                        <ResourceTile
                            key={e.key}
                            item={e.item}
                            projectUuid={projectUuid}
                            showDescription={
                                block.config.showDescriptions ?? true
                            }
                        />
                    ))}
                    {Array.from({ length: pendingCount }).map((_, i) => (
                        <SkeletonRow key={`sk-${i}`} />
                    ))}
                </div>
            )}

            <TextInput
                size="sm"
                radius="md"
                placeholder="Paste a Claude artifact, YouTube, or any link…"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.currentTarget.value)}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                rightSectionWidth={64}
                rightSection={
                    <Group gap={2} wrap="nowrap">
                        <Tooltip label="Add data app" openDelay={200}>
                            <ActionIcon
                                variant="subtle"
                                color="ldGray.6"
                                size="sm"
                                aria-label="Add data app"
                                onClick={() => setIsAppPickerOpen(true)}
                            >
                                <MantineIcon icon={IconAppWindow} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Add link" openDelay={200}>
                            <ActionIcon
                                variant="subtle"
                                color="ldGray.6"
                                size="sm"
                                aria-label="Add resource"
                                onClick={() => startResolving(pasteValue)}
                            >
                                <MantineIcon icon={IconPlus} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                }
            />
            <div className={classes.buildHint}>
                Paste multiple links (one per line) to add them all at once, or
                add a data app with the app button.
            </div>
            <DataAppPickerModal
                opened={isAppPickerOpen}
                onClose={() => setIsAppPickerOpen(false)}
                projectUuid={projectUuid}
                existingAppUuids={existingAppUuids}
                onAdd={addDataApps}
            />
        </Stack>
    );
};
