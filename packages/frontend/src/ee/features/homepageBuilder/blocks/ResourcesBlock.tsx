import {
    type HomepageResourceItem,
    type HomepageResourceKind,
    type HomepageResourcesLayout,
} from '@lightdash/common';
import {
    ActionIcon,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine-8/core';
import {
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
import { BlockHeader, IconSquare, MiniPill } from './BlockShell';
import classes from './blockStyles.module.css';
import { PageGrid, PageGridItem } from './PageGrid';
import {
    faviconUrl,
    hostnameOf,
    looksLikeUrl,
    resolveResourceUrl,
    safeImageUrl,
} from './resourceUrls';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const KIND_META: Record<
    HomepageResourceKind,
    { icon: Icon; label: string; thumbAccent: string }
> = {
    video: { icon: IconVideo, label: 'Video', thumbAccent: '' },
    doc: { icon: IconBook, label: 'Doc', thumbAccent: '' },
    link: { icon: IconLink, label: 'Link', thumbAccent: '' },
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
};

const KIND_OPTIONS = (Object.keys(KIND_META) as HomepageResourceKind[]).map(
    (kind) => ({ value: kind, label: KIND_META[kind].label }),
);

const kindMeta = (kind: HomepageResourceKind) =>
    KIND_META[kind] ?? KIND_META.link;

// --- Thumbnails -------------------------------------------------------------

const CardThumb: FC<{ item: HomepageResourceItem }> = ({ item }) => {
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

    // No sharp photo → blurred colour backdrop (claude's card, else the site's
    // own favicon) with the crisp favicon floating on top.
    const backdrop = item.kind === 'claude' ? imageUrl : favicon;
    return (
        <div className={`${classes.resThumbTile} ${meta.thumbAccent}`}>
            {backdrop ? (
                <img
                    className={classes.resThumbBackdrop}
                    src={backdrop}
                    alt=""
                    loading="lazy"
                    aria-hidden
                />
            ) : null}
            {favicon && !faviconFailed ? (
                <img
                    className={classes.resFaviconFloat}
                    src={favicon}
                    alt={item.title}
                    loading="lazy"
                    onError={() => setFaviconFailed(true)}
                />
            ) : (
                <div className={classes.resGlyphFloat}>
                    <MantineIcon icon={meta.icon} size={26} />
                </div>
            )}
        </div>
    );
};

const RowThumb: FC<{ item: HomepageResourceItem }> = ({ item }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const [faviconFailed, setFaviconFailed] = useState(false);
    const imageUrl = safeImageUrl(item.imageUrl);
    if (imageUrl && item.kind !== 'claude' && !imgFailed) {
        return (
            <div className={classes.rowThumb}>
                <img
                    src={imageUrl}
                    alt=""
                    loading="lazy"
                    onError={() => setImgFailed(true)}
                />
            </div>
        );
    }
    const favicon = faviconUrl(item.url);
    if (favicon && !faviconFailed) {
        return (
            <div className={`${classes.rowThumb} ${classes.rowThumbFallback}`}>
                <img
                    className={classes.rowFavicon}
                    src={favicon}
                    alt=""
                    loading="lazy"
                    onError={() => setFaviconFailed(true)}
                />
            </div>
        );
    }
    return <IconSquare icon={kindMeta(item.kind).icon} />;
};

// --- Read-only presentation (published + preview) ---------------------------

const ResourceCard: FC<{ item: HomepageResourceItem }> = ({ item }) => {
    const meta = kindMeta(item.kind);
    return (
        <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${classes.mediaCard} ${classes.cardUnit1} ${classes.clickable} ${classes.plainLink}`}
        >
            <CardThumb item={item} />
            <div className={classes.mediaBody}>
                <div className={classes.mediaKind}>
                    <MantineIcon icon={meta.icon} size={12} />
                    <span>{meta.label}</span>
                    <MantineIcon
                        icon={IconExternalLink}
                        size={12}
                        className={classes.mediaExternal}
                    />
                </div>
                <div className={classes.mediaTitle}>
                    {item.title || hostnameOf(item.url)}
                </div>
                {item.description ? (
                    <div className={classes.mediaDesc}>{item.description}</div>
                ) : null}
            </div>
        </a>
    );
};

const ResourceRow: FC<{ item: HomepageResourceItem }> = ({ item }) => {
    const meta = kindMeta(item.kind);
    return (
        <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${classes.listRow} ${classes.clickable} ${classes.plainLink}`}
        >
            <RowThumb item={item} />
            <div className={classes.flexFill}>
                <div className={classes.rowName}>{item.title}</div>
                <div className={classes.rowMeta}>
                    {item.description || hostnameOf(item.url)}
                </div>
            </div>
            <MiniPill>{meta.label}</MiniPill>
            <MantineIcon icon={IconExternalLink} size={14} color="ldGray.4" />
        </a>
    );
};

export const ResourcesBlockView: FC<BlockComponentProps> = ({
    block,
    itemSpan,
}) => {
    if (block.type !== 'resources' || block.config.items.length === 0) {
        return null;
    }
    const layout: HomepageResourcesLayout = block.config.layout ?? 'list';
    return (
        <Stack gap={0}>
            <BlockHeader icon={IconBook} title={block.config.title} />
            {layout === 'card' ? (
                <PageGrid itemSpan={itemSpan ?? null}>
                    {block.config.items.map((item, i) => (
                        <PageGridItem key={`${item.url}-${i}`}>
                            <ResourceCard item={item} />
                        </PageGridItem>
                    ))}
                </PageGrid>
            ) : (
                <div className={classes.listCard}>
                    {block.config.items.map((item, i) => (
                        <ResourceRow key={`${item.url}-${i}`} item={item} />
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
    <div className={classes.listRow}>
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

const BuildCard: FC<EditProps> = ({ item, onPatch, onRemove }) => (
    <div className={classes.mediaCard}>
        <CardThumb item={item} />
        <div className={classes.mediaBody}>
            <Group gap={4} justify="space-between" wrap="nowrap">
                <KindSelect
                    value={item.kind}
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

const BuildRow: FC<EditProps> = ({ item, onPatch, onRemove }) => (
    <div className={classes.listRow}>
        <RowThumb item={item} />
        <div className={classes.flexFill}>
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
        <KindSelect value={item.kind} onChange={(kind) => onPatch({ kind })} />
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
}) => {
    const [pasteValue, setPasteValue] = useState('');
    const [batch, setBatch] = useState<BatchEntry[]>([]);
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
                            label: <MantineIcon icon={IconLayoutGrid} />,
                        },
                        {
                            value: 'list',
                            label: <MantineIcon icon={IconLayoutList} />,
                        },
                    ]}
                />
            </Group>

            {layout === 'card' ? (
                <PageGrid itemSpan={itemSpan ?? null}>
                    {items.map((item, i) => (
                        <PageGridItem key={`${item.url}-${i}`}>
                            <BuildCard
                                item={item}
                                onPatch={(patch) => patchItem(i, patch)}
                                onRemove={() => removeItem(i)}
                            />
                        </PageGridItem>
                    ))}
                    {resolvedBatch.map((e) => (
                        <PageGridItem key={e.key}>
                            <ResourceCard item={e.item} />
                        </PageGridItem>
                    ))}
                    {Array.from({ length: pendingCount }).map((_, i) => (
                        <PageGridItem key={`sk-${i}`}>
                            <SkeletonCard />
                        </PageGridItem>
                    ))}
                </PageGrid>
            ) : (
                <div className={classes.listCard}>
                    {items.map((item, i) => (
                        <BuildRow
                            key={`${item.url}-${i}`}
                            item={item}
                            onPatch={(patch) => patchItem(i, patch)}
                            onRemove={() => removeItem(i)}
                        />
                    ))}
                    {resolvedBatch.map((e) => (
                        <ResourceRow key={e.key} item={e.item} />
                    ))}
                    {Array.from({ length: pendingCount }).map((_, i) => (
                        <SkeletonRow key={`sk-${i}`} />
                    ))}
                </div>
            )}

            <Group gap="xs" align="flex-end">
                <TextInput
                    size="xs"
                    flex={1}
                    placeholder="Paste a Claude artifact, YouTube, or any link…"
                    value={pasteValue}
                    onChange={(e) => setPasteValue(e.currentTarget.value)}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                />
                <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label="Add resource"
                    onClick={() => startResolving(pasteValue)}
                >
                    <MantineIcon icon={IconPlus} />
                </ActionIcon>
            </Group>
            <div className={classes.buildHint}>
                Paste multiple links (one per line) to add them all at once.
            </div>
        </Stack>
    );
};
