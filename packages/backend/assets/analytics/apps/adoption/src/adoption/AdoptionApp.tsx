import { useAppState } from '@lightdash/query-sdk';
import { ChevronDown, ChevronRight, Loader2, Settings2, SlidersHorizontal } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import './adoption.css';
import { Fingerprint } from './components/Fingerprint';
import { FocusAreas } from './components/FocusAreas';
import { Legend } from './components/Legend';
import { RecentActivity } from './components/RecentActivity';
import { TeamMapping } from './components/TeamMapping';
import { useContainerSize } from './components/useContainerSize';
import { useFitHeight } from './components/useFitHeight';
import { source, type PeopleFilter } from './queries/source';
import { GrowthDetail } from './growth/GrowthDetail';
import { getFollowSweep, SWEEP_ON } from './map/colourTransition';
import { PeopleMap, type MapTeam } from './map/PeopleMap';
import {
    bucketCells,
    buildMarks,
    buildOrganisation,
    COLOUR_BY_LABELS,
    countByKind,
    DEFAULT_TEAM_CONFIG,
    formatCount,
    formatPeople,
    getMarkUnit,
    NAMED_PEOPLE_LIMIT,
    PART_COUNT,
    PARTS,
    popcount,
    resolveTeams,
    sumCounts,
    usageOf,
    type Cell,
    type ColourBy,
    type Organisation,
    type Team,
    type TeamBucket,
    type TeamConfig,
} from './model';
import { WaffleView } from './waffle/WaffleView';

const MAP_HEIGHT = 560;
// The waffle shrinks its squares to fit the window, but is never squeezed below this
const MIN_WAFFLE_HEIGHT = 240;
// The map gives up height to fit the window too, down to this
const MIN_MAP_HEIGHT = 320;
// The legend is this tall for every colouring
const LEGEND_HEIGHT = 61;
// About how far under the drawing's bottom edge the detail card begins (the legend sits between)
const DETAIL_BELOW_MAP_PX = 60;
// Longer than the sweep takes to cross the map and the detail below it
const SWEEP_WINDOW_MS = 3000;
const COLOUR_BYS: ColourBy[] = ['usage', 'activity', 'role', 'growth'];
const LAYOUTS = ['map', 'waffle'] as const;
type Layout = (typeof LAYOUTS)[number];
const LAYOUT_LABELS: Record<Layout, string> = { map: 'Map', waffle: 'Waffle' };

// A saved value is read defensively: anything missing or of the wrong kind falls back to the default
const readConfig = (value: unknown): TeamConfig => {
    if (typeof value !== 'object' || value === null) return DEFAULT_TEAM_CONFIG;
    const { teams, primary } = value as { teams?: unknown; primary?: unknown };
    return {
        teams: Array.isArray(teams)
            ? teams.flatMap((team): Team[] =>
                  typeof team === 'object' && team !== null && typeof team.id === 'string' && Array.isArray(team.groupIds)
                      ? [
                            {
                                id: team.id,
                                name: typeof team.name === 'string' ? team.name : 'Unnamed team',
                                groupIds: team.groupIds.map(String),
                                ...(Array.isArray(team.memberIds) ? { memberIds: team.memberIds.map(String) } : {}),
                            },
                        ]
                      : [],
              )
            : null,
        primary:
            typeof primary === 'object' && primary !== null
                ? Object.fromEntries(Object.entries(primary).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
                : {},
    };
};

const Segmented = <T extends string>({
    label,
    options,
    labels,
    value,
    onChange,
    extras,
}: {
    label: string;
    options: readonly T[];
    labels: Record<T, string>;
    value: T;
    onChange: (value: T) => void;
    // A small control that sits inside an option's own pill, after its name
    extras?: Partial<Record<T, ReactNode>>;
}) => (
    <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="inline-flex rounded-md border bg-muted p-0.5" role="group" aria-label={label}>
            {options.map((option, index) => {
                const pill = value === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground';
                const extra = extras?.[option];
                // A thin line between neighbouring options, left out beside the chosen one, whose own shape already sets it apart
                const hasLine = index > 0 && value !== option && value !== options[index - 1];
                return (
                    <span key={option} className="contents">
                        {index > 0 && <span aria-hidden className={`my-1.5 w-px ${hasLine ? 'bg-border' : 'bg-transparent'}`} />}
                        {extra ? (
                            <span className={`inline-flex items-stretch rounded ${pill}`}>
                                <button type="button" aria-pressed={value === option} className="rounded-l py-1 pl-2.5 pr-0.5 text-xs font-medium" onClick={() => onChange(option)}>
                                    {labels[option]}
                                </button>
                                {extra}
                            </span>
                        ) : (
                            <button type="button" aria-pressed={value === option} className={`rounded px-2.5 py-1 text-xs font-medium ${pill}`} onClick={() => onChange(option)}>
                                {labels[option]}
                            </button>
                        )}
                    </span>
                );
            })}
        </div>
    </div>
);

const ALL_PARTS = 2 ** PART_COUNT - 1;

// The arrow on the Features colouring: which features count towards it. None chosen is allowed, and draws everyone
// as using no features, which makes it quick to go from one feature to the next.
const FeatureMenu = ({ features, onFeatures }: { features: number; onFeatures: (next: number) => void }) => {
    const chosen = popcount(features);
    const stay = (event: Event) => event.preventDefault();
    const summary = chosen === PART_COUNT ? 'all features' : chosen === 0 ? 'no features' : `${chosen} of ${PART_COUNT} features`;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    // Part of the Features button it sits in: no line between them
                    className="inline-flex items-center rounded-r pl-0.5 pr-2 hover:text-foreground"
                    aria-label={`Choose the features to colour by (${summary})`}
                    title={`Choose the features to colour by (${summary})`}
                >
                    {/* The arrow takes the features' own colour when the drawing is not counting every feature */}
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={chosen < PART_COUNT ? 3 : 2} style={chosen < PART_COUNT ? { color: 'var(--ad-most)' } : undefined} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
                {PARTS.map((part, index) => {
                    const bit = 1 << index;
                    return (
                        <DropdownMenuCheckboxItem
                            key={part.key}
                            checked={(features & bit) !== 0}
                            title={part.hint}
                            // The menu stays open, so several can be changed in one go
                            onSelect={stay}
                            onCheckedChange={(checked) => onFeatures(checked ? features | bit : features & ~bit)}
                        >
                            {part.label}
                        </DropdownMenuCheckboxItem>
                    );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={chosen === PART_COUNT} onSelect={(event) => { stay(event); onFeatures(ALL_PARTS); }}>
                    Choose all
                </DropdownMenuItem>
                <DropdownMenuItem disabled={chosen === 0} onSelect={(event) => { stay(event); onFeatures(0); }}>
                    Clear all
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

// Settings changed now and then, behind one button so the bar above the drawing keeps its shape
const OptionsMenu = ({ hideNoTeam, canHideNoTeam, onHideNoTeam }: { hideNoTeam: boolean; canHideNoTeam: boolean; onHideNoTeam: (next: boolean) => void }) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs font-medium">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Options
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
            {/* Unavailable when everyone is in a team, so there is nobody to hide */}
            <DropdownMenuCheckboxItem checked={hideNoTeam} disabled={!canHideNoTeam} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => onHideNoTeam(checked === true)}>
                Hide people not in a team
            </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
    </DropdownMenu>
);

const toMapTeam = (bucket: TeamBucket, colourBy: ColourBy, unit: number): MapTeam => {
    return {
        id: bucket.team.id,
        name: bucket.team.name,
        people: bucket.people,
        isNoTeam: bucket.isNoTeam,
        // People in more than one team are drawn like anyone else: no ring, and no entry in the legend
        marks: buildMarks(bucket, colourBy, unit).map((mark) => (mark.shared ? { ...mark, shared: false } : mark)),
        caption: formatPeople(bucket.people),
    };
};

// Loads one team's people by name. Mounted only while a team is open in an organisation too large to name everyone.
const TeamPeople = ({
    bucket,
    config,
    allTeamGroupIds,
    known,
    children,
}: {
    bucket: TeamBucket;
    config: TeamConfig;
    allTeamGroupIds: string[];
    // People the overview already has by name, such as those added to a team by name
    known: Cell[];
    children: (named: { bucket: TeamBucket; isNamed: boolean; isLoading: boolean; isTruncated: boolean }) => ReactNode;
}) => {
    const filter = useMemo<PeopleFilter>(() => {
        if (bucket.isNoTeam) return { kind: 'outsideGroups', groupIds: allTeamGroupIds };
        // A team of picked people has no groups to look up
        return bucket.team.groupIds.length > 0
            ? { kind: 'groups', groupIds: bucket.team.groupIds }
            : { kind: 'users', userIds: bucket.team.memberIds ?? [] };
    }, [bucket.isNoTeam, bucket.team.groupIds, bucket.team.memberIds, allTeamGroupIds]);
    const people = source.usePeople(filter);
    // The same rules as the overview, so someone shown only in another team is left out here
    const named = useMemo(() => {
        const seen = new Set(people.data.flatMap((cell) => (cell.person ? [cell.person.id] : [])));
        const everyone = [...people.data, ...known.filter((cell) => cell.person && !seen.has(cell.person.id))];
        return buildOrganisation(everyone, config).buckets.find((each) => each.team.id === bucket.team.id);
    }, [people.data, known, config, bucket.team.id]);
    const isReady = !people.loading && people.error === null && named !== undefined;
    return (
        <div className="contents" {...people.lineage}>
            {children({
                bucket: isReady ? { ...named, team: bucket.team } : bucket,
                isNamed: isReady,
                isLoading: people.loading,
                isTruncated: people.truncated ?? false,
            })}
        </div>
    );
};

type DetailState = {
    colourBy: ColourBy;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
};

const DETAIL_TITLES: Record<ColourBy, string> = {
    usage: 'Feature fingerprint',
    activity: 'Recent activity',
    role: 'Roles',
    growth: 'Growth status',
};

const DetailPanel = ({ detail, children }: { detail: DetailState; children: ReactNode }) => (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
        <h2 className="m-0 text-sm font-semibold">
            <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50"
                aria-expanded={detail.isOpen}
                onClick={() => detail.setIsOpen(!detail.isOpen)}
            >
                {detail.isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                {DETAIL_TITLES[detail.colourBy]}
            </button>
        </h2>
        {detail.isOpen && <div key={detail.colourBy} className="border-t">{children}</div>}
    </div>
);

type MainProps = {
    cells: Cell[];
    // Everyone's names came with the overview
    isNamed: boolean;
    isTruncated: boolean;
    config: TeamConfig;
    setConfig: (next: TeamConfig | ((previous: TeamConfig) => TeamConfig)) => void;
    stateStatus: { persisted: boolean; error: string | null; lastChanged: string | null };
    canManage: boolean;
    // Where the page header has room for the team controls
    actionSlot: HTMLElement | null;
    detail: DetailState;
    setColourBy: (colour: ColourBy) => void;
};

const Main = ({ cells, isNamed, isTruncated, config, setConfig, stateStatus, canManage, actionSlot, detail, setColourBy }: MainProps) => {
    const { colourBy, setIsOpen: setDetailOpenValue } = detail;
    // The features chosen for the Features colouring, one bit each; kept in the link
    const [featuresValue, setFeatures] = useAppState<number>('features', ALL_PARTS, { scope: 'url' });
    // None chosen is allowed: every mark is then drawn as using no features
    const features = typeof featuresValue === 'number' && Number.isFinite(featuresValue) ? featuresValue & ALL_PARTS : ALL_PARTS;
    const featureCount = popcount(features);
    const [layoutValue, setLayout] = useAppState<string>('layout', 'map', { scope: 'url' });
    const [teamValue, setTeamValue] = useAppState<string>('team', '', { scope: 'url' });
    const [hideValue, setHideValue] = useAppState<boolean>('hideNoTeam', false, { scope: 'url' });
    // Remembered for each person, like the detail: where to spend effort, under the detail
    const [isFocusOpen, setIsFocusOpen] = useAppState<boolean>('focusOpen', false);
    // Only one of the two sections under the drawing is open at a time, so the page never needs scrolling:
    // opening one closes the other
    const setIsDetailOpen = useCallback(
        (open: boolean) => {
            setDetailOpenValue(open);
            if (open) setIsFocusOpen(false);
        },
        [setDetailOpenValue, setIsFocusOpen],
    );
    const panelDetail: DetailState = { ...detail, setIsOpen: setIsDetailOpen };
    const [isMappingOpen, setIsMappingOpen] = useState(false);
    // Values from the link are checked before use
    const layout: Layout = LAYOUTS.find((each) => each === layoutValue) ?? 'map';

    const organisation = useMemo(() => buildOrganisation(cells, config), [cells, config]);
    const hasNoTeam = organisation.buckets.some((bucket) => bucket.isNoTeam);
    const hideNoTeam = hideValue === true && hasNoTeam;
    // The map, waffle and fingerprint can leave out people who are in no team; the headline figures still count everyone
    const visible = useMemo<Organisation>(() => {
        if (!hideNoTeam) return organisation;
        const buckets = organisation.buckets.filter((bucket) => !bucket.isNoTeam);
        const inTeams = new Set(buckets.flatMap((bucket) => bucket.items.map((item) => item.cell)));
        const shown = organisation.cells.filter((cell) => inTeams.has(cell));
        return { ...organisation, buckets, cells: shown, total: sumCounts(shown) };
    }, [organisation, hideNoTeam]);
    const selected = visible.buckets.find((bucket) => bucket.team.id === teamValue) ?? null;
    const teams = useMemo(() => resolveTeams(config), [config]);
    const allTeamGroupIds = useMemo(() => [...new Set(teams.flatMap((team) => team.groupIds))].sort(), [teams]);
    const namedPeople = useMemo(() => cells.flatMap((cell) => (cell.person ? [cell.person] : [])), [cells]);
    const namedCells = useMemo(() => cells.filter((cell) => cell.person !== null), [cells]);
    // Opening a team also opens the detail under the map, which is where its people are listed
    const select = useCallback(
        (teamId: string | null) => {
            setTeamValue(teamId ?? '');
            if (teamId !== null) setIsDetailOpen(true);
        },
        [setTeamValue, setIsDetailOpen],
    );
    const canvas = useContainerSize();
    const fit = useFitHeight();
    // The detail's marks populate with the sweep that crosses the map, for as long as that takes after a change of
    // colouring; never on first load or when the detail is opened later, when the map does not sweep either
    const [isSweeping, setIsSweeping] = useState(false);
    const sweepTimer = useRef<number | undefined>(undefined);
    const changeColourBy = useCallback(
        (next: ColourBy) => {
            setColourBy(next);
            setIsSweeping(true);
            window.clearTimeout(sweepTimer.current);
            sweepTimer.current = window.setTimeout(() => setIsSweeping(false), SWEEP_WINDOW_MS);
        },
        [setColourBy],
    );
    const detailSweep = useMemo(
        () => (SWEEP_ON && isSweeping ? getFollowSweep({ width: canvas.width, height: canvas.height }, DETAIL_BELOW_MAP_PX) : null),
        [isSweeping, canvas.width, canvas.height],
    );

    const renderViews = (panelBucket: TeamBucket | null, named: { isNamed: boolean; isLoading: boolean; isTruncated: boolean }) => {
        // On the map a team that is open is drawn on its own
        const focused = panelBucket;
        const drawn = focused ? [focused] : visible.buckets;
        const inView = drawn.reduce((sum, bucket) => sum + bucket.people, 0);
        // Named people get a mark each; counts get a mark each up to 600 people in view, then one mark for several
        const hasNames = focused ? named.isNamed : isNamed;
        // The waffle always draws a square per person, and shrinks its squares to fit instead
        const unit = layout === 'waffle' || (hasNames && inView <= NAMED_PEOPLE_LIMIT) ? 1 : getMarkUnit(inView);
        // Only the marks read the chosen features; the detail below always shows every feature
        const narrowed = (bucket: TeamBucket): TeamBucket =>
            colourBy !== 'usage' || features === ALL_PARTS
                ? bucket
                : { ...bucket, items: bucket.items.map((item) => ({ ...item, cell: { ...item.cell, parts: item.cell.parts & features } })) };
        const mapTeams = drawn.map((bucket) => toMapTeam(narrowed(bucket), colourBy, unit));
        const legendCells = focused ? bucketCells(focused) : visible.cells;
        // The detail under the map shows only an open team; its rows are people once they are known by name
        const detailOrganisation: Organisation = focused ? { ...visible, buckets: [focused], cells: bucketCells(focused), total: focused.people } : visible;
        const detailPeople = focused && hasNames ? focused : null;
        return (
            <div>
                {/* With fewer features chosen the colour still runs from faint for one to full for all of them */}
                {featureCount < PART_COUNT && (
                    <style>
                        {Array.from({ length: featureCount }, (_, index) => `[data-kind='usage-f${index + 1}'] { --ad-step: ${featureCount === 1 ? 1 : (0.25 + (0.75 * index) / (featureCount - 1)).toFixed(3)}; }`).join('\n')}
                    </style>
                )}
                <div className="min-w-0 space-y-4">
                <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5">
                        <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Team in view">
                            {selected ? (
                                <>
                                    <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => select(null)}>
                                        All teams
                                    </button>
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate font-semibold" aria-current="location">
                                        {selected.team.name}
                                    </span>
                                </>
                            ) : (
                                <span className="font-semibold">All teams</span>
                            )}
                        </nav>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <Segmented label="Layout" options={LAYOUTS} labels={LAYOUT_LABELS} value={layout} onChange={setLayout} />
                            <Segmented
                                label="Colour by"
                                options={COLOUR_BYS}
                                labels={COLOUR_BY_LABELS}
                                value={colourBy}
                                onChange={changeColourBy}
                                extras={{
                                    // Choosing features also turns the Features colouring on, so the choice is seen at once
                                    usage: (
                                        <FeatureMenu
                                            features={features}
                                            onFeatures={(next) => {
                                                setFeatures(next);
                                                if (colourBy !== 'usage') changeColourBy('usage');
                                            }}
                                        />
                                    ),
                                }}
                            />
                            <OptionsMenu hideNoTeam={hideNoTeam} canHideNoTeam={hasNoTeam} onHideNoTeam={setHideValue} />
                        </div>
                    </div>
                    {visible.total === 0 ? (
                                <div className="flex items-center justify-center p-10 text-center text-sm text-muted-foreground" style={{ height: MAP_HEIGHT }}>
                                    {hideNoTeam
                                        ? 'Nobody is in a team yet. Turn off "Hide people not in a team" to see everyone.'
                                        : 'There is nobody in this organisation yet. People appear here once they are invited.'}
                                </div>
                            ) : layout === 'map' ? (
                                // The outer box is measured for the room the window leaves; the inner one is the map's own size
                                <div ref={fit.ref}>
                                <div ref={canvas.ref} className="ad-canvas" style={{ height: Math.min(MAP_HEIGHT, Math.max(fit.height ?? MAP_HEIGHT, MIN_MAP_HEIGHT)) }}>
                                    {canvas.isMeasured && (
                                        <PeopleMap
                                            width={canvas.width}
                                            height={canvas.height}
                                            teams={mapTeams}
                                            colourBy={colourBy}
                                            selectedId={null}
                                            isFocused={focused !== null}
                                            layoutKey={`${selected?.team.id ?? 'all'}:${unit}`}
                                            onSelect={select}
                                        />
                                    )}
                                </div>
                                </div>
                            ) : (
                                // The outer box is measured for the room the window leaves; the inner one for its width
                                <div ref={fit.ref}>
                                <div ref={canvas.ref} style={{ minHeight: 1 }}>
                                    {canvas.isMeasured && (
                                        <WaffleView
                                            width={canvas.width}
                                            maxHeight={Math.min(MAP_HEIGHT, Math.max(fit.height ?? MAP_HEIGHT, MIN_WAFFLE_HEIGHT))}
                                            teams={mapTeams}
                                            colourBy={colourBy}
                                            selectedId={selected?.team.id ?? null}
                                            isFocused={focused !== null}
                                            onSelect={select}
                                        />
                                    )}
                                </div>
                                </div>
                            )}
                    <Legend colourBy={colourBy} counts={countByKind(legendCells, colourBy)} notes={[]} hasSharedMarks={false} />
                </div>
                <DetailPanel detail={panelDetail}>
                    {colourBy === 'growth' ? (
                        <GrowthDetail organisation={detailOrganisation} selectedId={selected?.team.id ?? null} onOpen={(teamId) => select(teamId)} focus={detailPeople} />
                    ) : colourBy === 'usage' ? (
                        <Fingerprint organisation={detailOrganisation} selectedId={selected?.team.id ?? null} selectedPart={null} shownParts={ALL_PARTS} onOpen={(teamId) => select(teamId)} focus={detailPeople} sweep={detailSweep} />
                    ) : (
                        <RecentActivity organisation={detailOrganisation} selectedId={selected?.team.id ?? null} onOpen={(teamId) => select(teamId)} focus={detailPeople} mode={colourBy === 'role' ? 'role' : 'activity'} sweep={detailSweep} />
                    )}
                </DetailPanel>
                <FocusAreas
                    organisation={organisation}
                    isOpen={isFocusOpen && !detail.isOpen}
                    onToggle={() => {
                        const next = !(isFocusOpen && !detail.isOpen);
                        if (next) setDetailOpenValue(false);
                        setIsFocusOpen(next);
                    }}
                    // Picking a team changes only the drawing above: the team opens in the colouring that shows why it
                    // stood out, and the detail section stays as it was
                    onPick={(teamId, view) => {
                        setTeamValue(teamId);
                        if (view.colourBy !== colourBy) changeColourBy(view.colourBy);
                    }}
                />
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {isTruncated && (
                <p className="m-0 rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
                    This organisation is too large to load in full, so some people are missing from this page.
                </p>
            )}
            {actionSlot &&
                createPortal(
                    <>
                        {teams.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                                No teams yet{canManage ? '.' : '. An admin can set them up.'}
                            </span>
                        )}
                        {canManage && (
                            <Button variant="outline" size="sm" className="h-8" onClick={() => setIsMappingOpen(true)}>
                                <Settings2 />
                                Choose teams
                            </Button>
                        )}
                    </>,
                    actionSlot,
                )}
            {selected === null || isNamed ? (
                renderViews(selected, { isNamed, isLoading: false, isTruncated: false })
            ) : (
                <TeamPeople bucket={selected} config={config} allTeamGroupIds={allTeamGroupIds} known={namedCells}>
                    {(named) => renderViews(named.bucket, named)}
                </TeamPeople>
            )}
            {canManage && (
                <TeamMapping
                    open={isMappingOpen}
                    onOpenChange={setIsMappingOpen}
                    groups={organisation.groups}
                    people={namedPeople}
                    directory={isNamed ? namedCells : null}
                    config={config}
                    onSave={(next) => setConfig(next)}
                    status={stateStatus}
                />
            )}
        </div>
    );
};

const MembershipMap = ({ cells, config }: { cells: Cell[]; config: TeamConfig }) => {
    const canvas = useContainerSize();
    const fit = useFitHeight();
    const organisation = useMemo(() => buildOrganisation(cells, config), [cells, config]);
    const unit = getMarkUnit(organisation.total);
    const teams = useMemo(
        () => organisation.buckets.map((bucket) => toMapTeam(bucket, 'role', unit)),
        [organisation.buckets, unit],
    );
    return (
        // Drawn in grey as a placeholder: who is in each team is known before what they have used, and the marks take
        // their colours once that arrives, with no change of colouring in between
        <div className="overflow-hidden rounded-lg border bg-card" aria-hidden="true">
            <div ref={fit.ref}>
            <div ref={canvas.ref} className="ad-canvas" style={{ height: Math.min(MAP_HEIGHT, Math.max(fit.height ?? MAP_HEIGHT, MIN_MAP_HEIGHT)), filter: 'grayscale(1)', opacity: 0.45 }} inert>
                {canvas.isMeasured && (
                    <PeopleMap
                        width={canvas.width}
                        height={canvas.height}
                        teams={teams}
                        colourBy="role"
                        selectedId={null}
                        isFocused={false}
                        layoutKey={`all:${unit}`}
                        onSelect={() => {}}
                    />
                )}
            </div>
            </div>
            {/* Holds the room the legend takes, so the drawing does not jump when it arrives */}
            <div className="border-t" style={{ height: LEGEND_HEIGHT }} />
        </div>
    );
};

const Loading = ({ total, preview, detail }: { total: number | null; preview?: ReactNode; detail: DetailState }) => (
    <div className="space-y-4">
        <p className="m-0 text-sm" role="status">
            {total === null
                ? 'Loading adoption data…'
                : `${total.toLocaleString()} current organization ${total === 1 ? 'member' : 'members'}. Loading activity…`}
        </p>
        {preview ?? (
            <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {Array.from({ length: 5 }, (_, index) => (
                        <Skeleton key={index} className="h-[76px]" />
                    ))}
                </div>
                <Skeleton className="h-[560px]" />
            </>
        )}
        <DetailPanel detail={detail}>
            <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Loading details…
            </div>
        </DetailPanel>
    </div>
);

const Failure = ({ text }: { text: string }) => (
    <div className="rounded-lg border border-destructive p-6 text-sm" role="alert">
        <p className="m-0 font-semibold">The adoption data could not be loaded.</p>
        <p className="m-0 mt-1 text-muted-foreground">{text}</p>
    </div>
);

type LoaderProps = {
    main: Omit<MainProps, 'cells' | 'isNamed' | 'isTruncated'>;
    loadingView: ReactNode;
};

// 150 people or fewer: one query brings everyone by name
const NamedOrganisation = ({ main, loadingView }: LoaderProps) => {
    const everyone = useMemo<PeopleFilter>(() => ({ kind: 'everyone' }), []);
    const people = source.usePeople(everyone);
    if (people.loading) return loadingView;
    if (people.error) return <Failure text={people.error} />;
    return (
        <div className="contents" {...people.lineage}>
            <Main {...main} cells={people.data} isNamed isTruncated={false} />
        </div>
    );
};

// The few people shown in one team only are loaded by name, so the rule can be applied to them
const PinnedPeople = ({ userIds, children }: { userIds: string[]; children: (cells: Cell[], loading: boolean) => ReactNode }) => {
    const filter = useMemo<PeopleFilter>(() => ({ kind: 'users', userIds }), [userIds]);
    const people = source.usePeople(filter);
    return <>{children(people.data, people.loading)}</>;
};

// Larger organisations: counts for the overview, and names only for the team that is open
const CountedOrganisation = ({ main, loadingView }: LoaderProps) => {
    // People shown in one team only, and people added to a team by name, are loaded one by one
    const pinnedKey = [...new Set([...Object.keys(main.config.primary), ...(main.config.teams ?? []).flatMap((team) => team.memberIds ?? [])])]
        .sort()
        .join(',');
    const pinnedIds = useMemo(() => (pinnedKey === '' ? [] : pinnedKey.split(',')), [pinnedKey]);
    const counts = source.useCounts(pinnedIds);
    const render = (pinned: Cell[], pinnedLoading: boolean) => {
        if (counts.loading || pinnedLoading) return loadingView;
        if (counts.error) return <Failure text={counts.error} />;
        return (
            <div className="contents" {...counts.lineage}>
                <Main {...main} cells={[...counts.data, ...pinned]} isNamed={false} isTruncated={counts.truncated ?? false} />
            </div>
        );
    };
    return pinnedIds.length > 0 ? <PinnedPeople userIds={pinnedIds}>{render}</PinnedPeople> : render([], false);
};

const formatChanged = (name: string | null, at: string | null): string | null => {
    if (at === null) return null;
    const when = new Date(at);
    const date = Number.isNaN(when.getTime()) ? '' : ` on ${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return `Last changed${name ? ` by ${name}` : ''}${date}.`;
};

const STATE_ERRORS: Record<string, string> = {
    conflict: 'Someone else changed the teams while you were editing. You are now seeing their version: make your change again and save.',
    forbidden: 'You can see the teams here but not change them.',
    invalid: 'The teams could not be saved because there are too many to store.',
};

export default function AdoptionApp() {
    const viewer = source.useViewer();
    const [saved, setSaved, meta] = useAppState<TeamConfig>('teams', source.fixtureTeams ?? DEFAULT_TEAM_CONFIG, { scope: 'shared' });
    const config = useMemo(() => readConfig(saved), [saved]);
    const [colourValue, setColourBy] = useAppState<string>('colour', 'usage', { scope: 'url' });
    const [isDetailOpen, setIsDetailOpen] = useAppState<boolean>('detailOpen', false);
    const detail: DetailState = {
        colourBy: COLOUR_BYS.find((each) => each === colourValue) ?? 'usage',
        isOpen: isDetailOpen,
        setIsOpen: setIsDetailOpen,
    };
    const membership = source.useMembership();
    const total = membership.loading || membership.truncated ? null : sumCounts(membership.data);
    const author = meta.updatedBy as { name?: string } | null;
    const errorCode = (meta.error as { code?: string } | null)?.code;
    const stateStatus = {
        persisted: meta.persisted,
        error: meta.error ? (STATE_ERRORS[errorCode ?? ''] ?? 'The teams were not saved. Try again.') : null,
        lastChanged: formatChanged(author?.name ?? null, meta.updatedAt ? String(meta.updatedAt) : null),
    };
    const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
    // Group counts cannot place people who have individual team assignments.
    const canPreviewMap = !meta.loading && total !== null && total > 0 &&
        Object.keys(config.primary).length === 0 &&
        !config.teams?.some((team) => (team.memberIds?.length ?? 0) > 0);
    const props: LoaderProps = {
        main: { config, setConfig: setSaved, stateStatus, canManage: viewer.isAdmin, actionSlot, detail, setColourBy },
        loadingView: (
            <Loading
                total={total}
                detail={detail}
                preview={canPreviewMap ? <MembershipMap cells={membership.data} config={config} /> : null}
            />
        ),
    };
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div data-ad-page className="mx-auto max-w-[1400px] px-6 pb-10 pt-6">
                <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                        <h1 className="m-0 text-xl font-semibold tracking-tight">Adoption</h1>
                        {source.fixture && <p className="m-0 text-xs text-muted-foreground">Invented sample data ({source.fixture}).</p>}
                    </div>
                    {/* The team controls are drawn here by the page below once it has loaded */}
                    <div ref={setActionSlot} className="flex items-center gap-3" />
                </header>
                {membership.error ? (
                    <Failure text={membership.error} />
                ) : membership.loading || meta.loading ? (
                    props.loadingView
                ) : total !== null && total <= NAMED_PEOPLE_LIMIT ? (
                    <div className="contents" {...membership.lineage}>
                        <NamedOrganisation {...props} />
                    </div>
                ) : (
                    <div className="contents" {...membership.lineage}>
                        <CountedOrganisation {...props} />
                    </div>
                )}
            </div>
        </div>
    );
}
