import {
    ActionIcon,
    Anchor,
    Box,
    Group,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconChevronRight,
    IconCode,
    IconFileCode,
    IconListDetails,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
    useContext,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type FC,
    type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router';
import { AiMarkdown } from '../../components/common/AiMarkdown';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useTableFields } from '../sqlRunner/hooks/useTableFields';
import { AddSourceButton } from './AddSourceButton';
import { CodeSnippet } from './CodeSnippet';
import { DraftMarksContext } from './draftMarks';
import { KindTypeIcon } from './KindTypeIcon';
import { LineCounts } from './LineCounts';
import { getExplore, getSource, type Explore, type Field } from './model';
import { CHANGE_KIND_LABELS, findFieldBlock } from './modelCode';
import { MOD_KEY } from './pierreEditor';
import { ProtoFieldCode, type DbtEdit, type FieldWord } from './ProtoFieldCode';
import { ProtoFileSearchContext, protoPlace } from './protoFlag';
import { useUnsavedFields } from './protoUnsaved';
import { FieldTypeIcon, NodeIcon } from './shared';
import { useAddToStudioChat } from './studioChatRefs';
import classes from './StudioProto.module.css';
import { useCatalogTables } from './useCatalogTables';
import { useExploreFields } from './useExploreFields';
import { useKeepsSemanticLayerDraft } from './useSemanticLayerModel';
import { type ViewModel } from './useSemanticStudio';
import { findCheckedOutModel, useStudioCheckout } from './useStudioCheckout';
import {
    modelNameOfSourcePath,
    SOURCE_PARAM,
    useStudioSources,
} from './useStudioSources';
import railClasses from './WorkbenchRail.module.css';

const selectedExploreId = (view: ViewModel) =>
    view.selected?.type === 'explore' || view.selected?.type === 'field'
        ? view.selected.exploreId
        : null;

/** Where a model's code is: the model, and its file's path where the project is a repository. */
export type FilesTarget = {
    model: string;
    path: string | null;
    /** The field to land on in the file; null for the file's top. */
    field: string | null;
};

const baseName = (path: string) => path.split('/').pop() ?? path;

/** A group's heading. Headings stack at the top once scrolled past and at the bottom until reached, so every group is one click away. */
const SectionHeader: FC<{
    label: string;
    count: number;
    isOpen: boolean;
    /** How many headings sit above and below this one in the list. */
    above: number;
    below: number;
    onToggle: () => void;
}> = ({ label, count, isOpen, above, below, onToggle }) => (
    <>
        <span
            className={classes.sectionAnchor}
            style={{ '--stick-top': above } as CSSProperties}
        />
        <button
            type="button"
            className={classes.row}
            data-section
            style={
                {
                    '--stick-top': above,
                    '--stick-bottom': below,
                } as CSSProperties
            }
            aria-expanded={isOpen}
            onClick={(event) => {
                const anchor = event.currentTarget.previousElementSibling;
                onToggle();
                // Opened from the bottom of the list, its contents come up to meet you
                if (!isOpen) {
                    requestAnimationFrame(() =>
                        anchor?.scrollIntoView({
                            block: 'start',
                            behavior: window.matchMedia(
                                '(prefers-reduced-motion: reduce)',
                            ).matches
                                ? 'auto'
                                : 'smooth',
                        }),
                    );
                }
            }}
        >
            <MantineIcon
                icon={IconChevronRight}
                size={12}
                color="dimmed"
                className={classes.chevron}
            />
            <Text truncate inherit fw={500} flex={1}>
                {label}
            </Text>
            <Text fz={11} c="dimmed">
                {count}
            </Text>
        </button>
    </>
);

/** Prototype: the warehouse is the tree; its models come first, then the tables nothing models yet. */
type RailProps = {
    view: ViewModel;
    openTable: string | null;
    onOpenTable: (reference: string) => void;
    /** Opens a file beside the list; null where the project has no files to show. */
    onOpenFiles: ((target: FilesTarget) => void) | null;
    openFile: string | null;
    /** Where the bar's status and actions render, now that the bar is gone. */
    onStatusSlot: (element: HTMLElement | null) => void;
    onActionsSlot: (element: HTMLElement | null) => void;
    /** Lines the draft adds and removes, by model. */
    counts: Map<string, { additions: number; deletions: number }>;
    /** In the code view: the project's file tree, shown under the models, which then open as files. */
    codeFiles: ReactNode | null;
    /** On a project that keeps its YAML in the app: the models that have a file there. Ones deployed from outside have none. */
    appFiles: string[];
};

const Rail: FC<RailProps & { repoFiles: string[] | null }> = ({
    view,
    openTable,
    onOpenTable,
    onOpenFiles,
    openFile,
    onStatusSlot,
    onActionsSlot,
    counts,
    codeFiles,
    appFiles,
    repoFiles,
}) => {
    const drafted = useContext(DraftMarksContext).kinds;
    const { schemas: catalog, isModelled } = useCatalogTables(view.project.id);
    const [search, setSearch] = useState('');
    const [toggled, setToggled] = useState<Record<string, boolean>>({});
    const query = search.trim().toLowerCase();
    const keepsDraft = useKeepsSemanticLayerDraft(view.project.id);
    // The model whose page or file is open; its files show under it
    const openExplore =
        openTable !== null
            ? null
            : openFile
              ? (view.project.explores.find(
                    ({ name }) =>
                        name ===
                        (keepsDraft
                            ? openFile.replace(/\.yml$/, '')
                            : modelNameOfSourcePath(openFile)),
                )?.id ?? null)
              : selectedExploreId(view);
    const models = view.project.explores
        .filter(
            ({ sourceId }) =>
                getSource(view.project, sourceId).kind === 'modelled',
        )
        .filter(({ label, name }) =>
            `${label} ${name}`.toLowerCase().includes(query),
        )
        .sort((a, b) => a.label.localeCompare(b.label));
    const warehouse = view.tree.nodes.find(
        ({ ref }) => ref.type === 'kind' && ref.kind === 'modelled',
    );
    // Every table the connection sees, as SQL Runner lists them; the ones with a model say so
    const schemas = catalog
        .map((entry) => ({
            schema: String(entry.schema),
            tables: Object.keys(entry.tables).filter((name) =>
                name.toLowerCase().includes(query),
            ),
        }))
        .filter(({ tables }) => tables.length > 0);
    const tableCount = schemas.reduce(
        (sum, { tables }) => sum + tables.length,
        0,
    );
    // A lone schema has nothing to choose between, so it starts open; several stay closed until asked for or searched
    const hasOneSchema = catalog.length === 1;
    // With nothing modelled yet, the tables are what there is to look at
    const isRestOpen =
        toggled.rest ??
        (query !== '' || hasOneSchema || view.project.explores.length === 0);
    const areModelsOpen = toggled.models ?? true;
    const hasFiles = false;
    const inCode = codeFiles !== null && onOpenFiles !== null;
    // A model's files: its YAML and SQL in a repository, or the one YAML the app keeps
    const filesOf = (explore: Explore) => {
        if (repoFiles === null)
            return appFiles.includes(explore.name)
                ? [{ name: `${explore.name}.yml`, path: null, isOpen: true }]
                : [];
        const mine = repoFiles
            .filter((path) => modelNameOfSourcePath(path) === explore.name)
            .sort(
                (a, b) =>
                    Number(a.endsWith('.sql')) - Number(b.endsWith('.sql')),
            );
        return mine.map((path) => ({
            name: path.split('/').pop() ?? path,
            path,
            // A pair opens together, so both are open
            isOpen: path === openFile || mine.length === 2,
        }));
    };
    // Code stays code: there a model opens as its file, YAML first; one with no file opens as itself
    const openModel = (explore: Explore) => {
        const mine = (repoFiles ?? []).filter(
            (path) => modelNameOfSourcePath(path) === explore.name,
        );
        const path =
            mine.find((file) => /\.ya?ml$/.test(file)) ?? mine[0] ?? null;
        // The open model's own row is the way back to its fields; its files under it are the code
        if (
            inCode &&
            explore.id !== openExplore &&
            (repoFiles === null
                ? appFiles.includes(explore.name)
                : path !== null)
        )
            onOpenFiles({ model: explore.name, path, field: null });
        else view.select({ type: 'explore', exploreId: explore.id });
    };
    const chevron = (isOpen: boolean) => (
        <MantineIcon
            icon={IconChevronRight}
            size={12}
            color="dimmed"
            className={classes.chevron}
            data-open={isOpen || undefined}
        />
    );
    return (
        <Box className={railClasses.rail}>
            {/* A draft tints its line: its name to switch, then what to do with it; Published is only the name */}
            <Box className={classes.draftBlock}>
                <Box className={classes.railTop}>
                    <Box ref={onStatusSlot} className={classes.railStatus} />
                    <Box ref={onActionsSlot} className={classes.railActions} />
                </Box>
            </Box>
            <Box className={classes.railSearch}>
                <TextInput
                    size="xs"
                    variant="filled"
                    flex={1}
                    placeholder="Search"
                    aria-label={
                        inCode
                            ? 'Search models and files'
                            : 'Search models and tables'
                    }
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    rightSection={<AddSourceButton view={view} />}
                    rightSectionPointerEvents="all"
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                />
            </Box>
            <Box
                className={`${railClasses.treeScroll} ${classes.railScroll}`}
                data-shares={(inCode && repoFiles !== null) || undefined}
                data-closed={(inCode && !areModelsOpen) || undefined}
            >
                <>
                    {warehouse && !inCode ? (
                        <button
                            type="button"
                            className={classes.row}
                            data-selected={
                                openTable === null &&
                                view.selectedKey === warehouse.key
                            }
                            onClick={() => view.select(warehouse.ref)}
                        >
                            <NodeIcon
                                project={view.project}
                                nodeRef={warehouse.ref}
                                size={14}
                            />
                            <Text truncate inherit fw={500}>
                                {warehouse.label}
                            </Text>
                        </button>
                    ) : null}
                    {/* No heading for a list with nothing in it */}
                    {view.project.explores.length > 0 ? (
                        <SectionHeader
                            label="Models"
                            count={models.length}
                            isOpen={areModelsOpen}
                            above={0}
                            below={
                                inCode
                                    ? 0
                                    : (tableCount > 0 ? 1 : 0) +
                                      (hasFiles ? 1 : 0)
                            }
                            onToggle={() =>
                                setToggled({
                                    ...toggled,
                                    models: !areModelsOpen,
                                })
                            }
                        />
                    ) : null}
                    {(areModelsOpen || query !== '' ? models : []).map(
                        (explore) => (
                            <Box key={explore.id}>
                                <button
                                    type="button"
                                    className={classes.row}
                                    data-depth={1}
                                    data-selected={
                                        explore.id === openExplore && !inCode
                                    }
                                    onClick={() => openModel(explore)}
                                >
                                    <NodeIcon
                                        project={view.project}
                                        nodeRef={{
                                            type: 'explore',
                                            exploreId: explore.id,
                                        }}
                                        size={14}
                                    />
                                    <TruncatedText
                                        fz={13}
                                        maxWidth="100%"
                                        inherit
                                        miw={0}
                                        tooltipPosition="right"
                                        tooltipOpenDelay={400}
                                    >
                                        {explore.label}
                                    </TruncatedText>
                                    {/* What the draft does to a model is said on its own row */}
                                    {drafted.has(explore.id) ? (
                                        <Box
                                            ml="auto"
                                            className={classes.rowChange}
                                        >
                                            {drafted.get(explore.id) ===
                                            'changed' ? (
                                                <LineCounts
                                                    counts={
                                                        counts.get(
                                                            explore.name,
                                                        ) ?? null
                                                    }
                                                />
                                            ) : (
                                                <Text fz={11} c="dimmed">
                                                    {
                                                        CHANGE_KIND_LABELS[
                                                            drafted.get(
                                                                explore.id,
                                                            ) ?? 'changed'
                                                        ]
                                                    }
                                                </Text>
                                            )}
                                        </Box>
                                    ) : null}
                                </button>
                                {/* The open model shows the files that make it; in the code view they are what is open */}
                                {explore.id === openExplore && onOpenFiles
                                    ? filesOf(explore).map((file) => (
                                          <button
                                              key={file.name}
                                              type="button"
                                              className={classes.row}
                                              data-depth={2}
                                              data-quiet
                                              data-selected={
                                                  inCode &&
                                                  (file.path === null ||
                                                      file.isOpen)
                                              }
                                              onClick={() =>
                                                  onOpenFiles({
                                                      model: explore.name,
                                                      path: file.path,
                                                      field: null,
                                                  })
                                              }
                                          >
                                              <MantineIcon
                                                  icon={IconFileCode}
                                                  size={13}
                                                  color="dimmed"
                                              />
                                              <TruncatedText
                                                  fz={13}
                                                  maxWidth="100%"
                                                  inherit
                                                  ff="monospace"
                                                  miw={0}
                                                  tooltipOpenDelay={400}
                                              >
                                                  {file.name}
                                              </TruncatedText>
                                          </button>
                                      ))
                                    : null}
                            </Box>
                        ),
                    )}
                    {tableCount > 0 && !inCode ? (
                        <SectionHeader
                            label="Tables"
                            count={tableCount}
                            isOpen={isRestOpen}
                            above={view.project.explores.length > 0 ? 1 : 0}
                            below={hasFiles ? 1 : 0}
                            onToggle={() =>
                                setToggled({ ...toggled, rest: !isRestOpen })
                            }
                        />
                    ) : null}
                    {isRestOpen && !inCode
                        ? schemas.map(({ schema, tables }) => {
                              const key = `schema:${schema}`;
                              const isOpen =
                                  toggled[key] ??
                                  (query !== '' || hasOneSchema);
                              return (
                                  <Box key={schema}>
                                      <button
                                          type="button"
                                          className={classes.row}
                                          data-depth={1}
                                          data-quiet
                                          aria-expanded={isOpen}
                                          data-pinned={2}
                                          onClick={() =>
                                              setToggled({
                                                  ...toggled,
                                                  [key]: !isOpen,
                                              })
                                          }
                                      >
                                          {chevron(isOpen)}
                                          <TruncatedText
                                              fz={13}
                                              maxWidth="100%"
                                              inherit
                                              flex={1}
                                              miw={0}
                                              tooltipPosition="right"
                                              tooltipOpenDelay={400}
                                          >
                                              {schema}
                                          </TruncatedText>
                                          <Text fz={11} c="dimmed">
                                              {tables.length}
                                          </Text>
                                      </button>
                                      {isOpen
                                          ? tables.map((name) => {
                                                const reference = `${schema}.${name}`;
                                                return (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        className={classes.row}
                                                        data-depth={2}
                                                        data-quiet
                                                        data-selected={
                                                            reference ===
                                                            openTable
                                                        }
                                                        onClick={() =>
                                                            onOpenTable(
                                                                reference,
                                                            )
                                                        }
                                                    >
                                                        <TruncatedText
                                                            fz={13}
                                                            maxWidth="100%"
                                                            inherit
                                                            flex={1}
                                                            miw={0}
                                                            tooltipPosition="right"
                                                            tooltipOpenDelay={
                                                                400
                                                            }
                                                        >
                                                            {name}
                                                        </TruncatedText>
                                                        {isModelled(
                                                            schema,
                                                            name,
                                                        ) ? (
                                                            <Tooltip label="A model reads this table">
                                                                <Box
                                                                    className={
                                                                        classes.modelledMark
                                                                    }
                                                                />
                                                            </Tooltip>
                                                        ) : null}
                                                    </button>
                                                );
                                            })
                                          : null}
                                  </Box>
                              );
                          })
                        : null}
                </>
                {view.tree.nodes
                    .filter((node) => node !== warehouse && !inCode)
                    .map((node) => (
                        <Box key={node.key}>
                            <button
                                type="button"
                                className={classes.row}
                                data-selected={
                                    openTable === null &&
                                    view.selectedKey === node.key
                                }
                                onClick={() => view.select(node.ref)}
                            >
                                <NodeIcon
                                    project={view.project}
                                    nodeRef={node.ref}
                                    size={14}
                                />
                                <Text truncate inherit fw={500} flex={1}>
                                    {node.label}
                                </Text>
                                <Text fz={11} c="dimmed">
                                    {node.exploreCount}
                                </Text>
                            </button>
                        </Box>
                    ))}
            </Box>
            {inCode && repoFiles !== null ? (
                <>
                    <Box className={classes.filesHead}>All files</Box>
                    <Box className={classes.filesRailBody}>
                        <ProtoFileSearchContext.Provider value={search}>
                            {codeFiles}
                        </ProtoFileSearchContext.Provider>
                    </Box>
                </>
            ) : null}
        </Box>
    );
};

// A dbt model's files are found in the repository by its name
const DbtRail: FC<RailProps> = (props) => {
    const { data } = useStudioSources(props.view.project.id, null, null);
    return <Rail {...props} repoFiles={data?.files ?? []} />;
};

/** Prototype: one sidebar for both views. Models lead; in the code view they open as files and the project's file tree sits under them. */
export const ProtoRail: FC<RailProps> = (props) =>
    // A project with no code view has no repository to read files from
    useKeepsSemanticLayerDraft(props.view.project.id) ||
    props.onOpenFiles === null ? (
        <Rail {...props} repoFiles={null} />
    ) : (
        <DbtRail {...props} />
    );

type Column = { name: string; type: string };

// Columns no model uses yet sit in the same list, quieter, saying so where a description would be
const UnusedColumns: FC<{ note: string; columns: Column[] }> = ({
    note,
    columns,
}) => (
    <>
        {columns.map((column) => (
            <Box key={column.name} className={classes.line} data-unused>
                <Box className={classes.name}>
                    <KindTypeIcon
                        fieldKind="dimension"
                        type={column.type}
                        name={column.name}
                    />
                    <TruncatedText
                        fz={13}
                        maxWidth="100%"
                        inherit
                        ff="monospace"
                        fw={400}
                        tooltipOpenDelay={400}
                    >
                        {column.name}
                    </TruncatedText>
                </Box>
                <Text truncate inherit>
                    {note}
                </Text>
                <span className={classes.origin}>{column.type}</span>
            </Box>
        ))}
    </>
);

const TableTitle: FC<{ reference: string }> = ({ reference }) => (
    <Group gap={6} wrap="nowrap" className={classes.reference}>
        <Text fz="xs" c="dimmed" ff="monospace">
            {reference}
        </Text>
        <Box className={classes.referenceCopy}>
            <CopyActionIcon
                value={reference}
                copyLabel={`Copy ${reference}`}
                copiedLabel="Copied to clipboard"
                size="xs"
            />
        </Box>
    </Group>
);

const ProtoTable: FC<{ view: ViewModel; reference: string }> = ({
    view,
    reference,
}) => {
    const projectUuid = view.project.id;
    const { isModelled } = useCatalogTables(projectUuid);
    const [schema, ...rest] = reference.split('.');
    const { data: columns } = useTableFields({
        projectUuid,
        tableName: rest.join('.'),
        schema,
        search: undefined,
    });
    // By name, as the catalog matching does when a model doesn't say which table it reads
    const model = isModelled(schema, rest.join('.'))
        ? view.project.explores.find(({ name }) => name === rest.join('.'))
        : undefined;
    return (
        <Box className={classes.pane}>
            <Box className={classes.header}>
                <Title
                    order={3}
                    ff="monospace"
                    fw={500}
                    className={classes.title}
                >
                    {rest.join('.')}
                </Title>
                <TableTitle reference={reference} />
                <Text fz="sm" c="dimmed">
                    {columns
                        ? `${columns.length} ${columns.length === 1 ? 'column' : 'columns'}. `
                        : 'Reading columns… '}
                    {model ? (
                        <Anchor
                            component="button"
                            inherit
                            onClick={() =>
                                view.select({
                                    type: 'explore',
                                    exploreId: model.id,
                                })
                            }
                        >
                            Modelled as {model.label}
                        </Anchor>
                    ) : isModelled(schema, rest.join('.')) ? (
                        'A model reads this table.'
                    ) : (
                        'Nothing models this table yet.'
                    )}
                </Text>
            </Box>
            <Box className={classes.listHead}>
                <span>Column</span>
                <span />
                <span>Type</span>
            </Box>
            <UnusedColumns note="" columns={columns ?? []} />
        </Box>
    );
};

// A field's words and code are one text: typing in either changes the same YAML, saved once
const FieldForm: FC<{
    field: Field;
    explore: Explore;
    /** The field's words and its own lines of code, both editing the same YAML. */
    code: (words: FieldWord[], actions: ReactNode) => ReactNode;
}> = ({ field, explore, code }) => {
    const addToChat = useAddToStudioChat();
    // What the old field window said under its properties: how it is defined, who sees it, how it is used
    const facts = [
        field.table !== explore.name ? `from ${field.tableLabel}` : null,
        field.visibleTo ? `visible to people with ${field.visibleTo}` : null,
        field.chartUsage === null
            ? null
            : field.chartUsage
              ? `used in ${field.chartUsage} ${field.chartUsage === 1 ? 'chart' : 'charts'}`
              : 'not used in any chart',
        field.lastEdit
            ? `changed by ${field.lastEdit.by} ${dayjs(field.lastEdit.at).fromNow()}`
            : null,
    ].filter((fact) => fact !== null);
    // The row already says the field's type; this line is only for what it does not say
    const about = [...facts, field.group ? `in ${field.group}` : null].filter(
        (fact) => fact !== null,
    );
    const words: FieldWord[] = [
        {
            name: 'Label',
            key: 'label',
            placeholder: field.name,
            fallback: field.label,
        },
        {
            name: 'Description',
            key: 'description',
            placeholder: 'Say what this field means',
            fallback: field.description,
        },
        {
            name: 'AI hint',
            key: 'ai_hint',
            placeholder: 'Tell the agent when to use it',
            fallback: field.aiHint,
        },
    ];
    const actions = (
        <>
            {addToChat ? (
                <Anchor
                    component="button"
                    c="dimmed"
                    onClick={() =>
                        addToChat({
                            modelName: explore.id,
                            fieldName: field.id,
                            modelLabel: explore.label,
                            fieldLabel: field.label,
                            fieldKind: field.fieldKind,
                            fieldType: field.type,
                            code: null,
                        })
                    }
                >
                    Ask in chat
                </Anchor>
            ) : null}
        </>
    );
    return (
        <Box className={classes.detail}>
            {code(words, actions)}
            {/* Without the YAML to show, the compiled definition stands in for it */}
            <span className={classes.term} data-fallback>
                {field.definition.label}
            </span>
            <Box className={classes.definition} data-fallback>
                <CodeSnippet code={field.definition.value} language="sql" />
            </Box>
            <span data-fallback />
            <Box className={classes.detailActions} data-fallback>
                {actions}
            </Box>
            {about.length > 0 ? (
                <>
                    <span data-last />
                    <span className={classes.facts} data-last>
                        {about.join(' · ')}
                    </span>
                </>
            ) : null}
        </Box>
    );
};

// A long description opens on its first lines; markdown in it is drawn, not shown raw
const Description: FC<{ text: string }> = ({ text }) => {
    const [showsAll, setShowsAll] = useState(false);
    if (!text) return null;
    const isLong = text.length > 180 || text.includes('\n');
    return (
        <Box>
            <Box
                className={classes.description}
                data-clamped={isLong && !showsAll ? true : undefined}
            >
                <AiMarkdown>{text}</AiMarkdown>
            </Box>
            {isLong ? (
                <Anchor
                    component="button"
                    fz="xs"
                    c="dimmed"
                    onClick={() => setShowsAll(!showsAll)}
                >
                    {showsAll ? 'Show less' : 'Show more'}
                </Anchor>
            ) : null}
        </Box>
    );
};

/** The code beside a model: which kind of file is open, kept while you move between models. */
export type CodeBeside = {
    /** `sql` or `yml`; null when no code is open. */
    extension: string | null;
    onChange: (extension: string | null) => void;
    /** Draws the real editor for a file; null where the project has no files to show. */
    render: ((target: FilesTarget) => ReactNode) | null;
    /** The code takes the whole workspace, list and sidebar included, as its own view. */
    isWide: boolean;
    /** Goes to the code view on a file; null where the project has no files to show. */
    open: ((target: FilesTarget) => void) | null;
    /** Reads and saves a repository file from the model page; null on a project that keeps its YAML in the app. */
    dbt: DbtEdit | null;
    readOnlyReason: string | null;
};

type DockProps = {
    view: 'model' | 'code';
    projectUuid: string;
    /** The model open in the model view, whose file the code view lands on; null when none is. */
    modelName: string | null;
    onOpenFiles: ((target: FilesTarget) => void) | null;
    onModel: () => void;
    /** Where the draft's actions render: beside the views, in reach from anywhere. */
    onActionsSlot: (element: HTMLElement | null) => void;
};

const DockButtons: FC<
    Pick<DockProps, 'view' | 'onModel' | 'onActionsSlot'> & {
        onCode: (() => void) | null;
    }
> = ({ view, onModel, onCode, onActionsSlot }) => {
    // One key flips between the two views, wherever the focus is
    const flip = useRef(() => {});
    flip.current = view === 'model' ? () => onCode?.() : onModel;
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key !== '.') return;
            event.preventDefault();
            flip.current();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, []);
    return (
        <Box className={classes.dock} role="group" aria-label="View">
            {/* Only where there is code to flip to; a raw table has none */}
            {onCode ? (
                <>
                    <button
                        type="button"
                        className={classes.dockButton}
                        aria-pressed={view === 'model'}
                        title={`Model (${MOD_KEY}.)`}
                        onClick={onModel}
                    >
                        <MantineIcon icon={IconListDetails} size={15} />
                        Model
                    </button>
                    <button
                        type="button"
                        className={classes.dockButton}
                        aria-pressed={view === 'code'}
                        title={`Code (${MOD_KEY}.)`}
                        onClick={onCode}
                    >
                        <MantineIcon icon={IconCode} size={15} />
                        Code
                    </button>
                </>
            ) : null}
            <Box ref={onActionsSlot} className={classes.dockActions} />
        </Box>
    );
};

const RepositoryDock: FC<DockProps> = ({
    projectUuid,
    modelName,
    onOpenFiles,
    ...props
}) => {
    const { data } = useStudioSources(projectUuid, null, null);
    const mine = (data?.files ?? []).filter(
        (path) =>
            modelName !== null && modelNameOfSourcePath(path) === modelName,
    );
    // The YAML is where a model's words are, so the code view opens there first
    const path = mine.find((file) => /\.ya?ml$/.test(file)) ?? mine[0] ?? null;
    return (
        <DockButtons
            {...props}
            onCode={
                onOpenFiles
                    ? () =>
                          onOpenFiles({
                              model: modelName ?? '',
                              path,
                              field: protoPlace.openField,
                          })
                    : null
            }
        />
    );
};

/** Prototype: a model is two files, so opening either shows both, YAML first; any other file opens alone. */
export const ProtoCodePair: FC<{
    projectUuid: string;
    prUrl: string | null;
    head: string | null;
    /** The open file; null leaves the code view as it is. */
    path: string | null;
    render: (file: string | null) => ReactNode;
}> = ({ projectUuid, prUrl, head, path, render }) => {
    const { data } = useStudioSources(projectUuid, prUrl, head);
    const folder = path?.split('/').slice(0, -1).join('/');
    const pair =
        path === null
            ? []
            : (data?.files ?? [])
                  .filter(
                      (file) =>
                          file.split('/').slice(0, -1).join('/') === folder &&
                          modelNameOfSourcePath(file) ===
                              modelNameOfSourcePath(path),
                  )
                  .sort(
                      (a, b) =>
                          Number(extensionOf(a) === 'sql') -
                          Number(extensionOf(b) === 'sql'),
                  );
    // One wrapper either way, so the code clears the dock and a narrow window stacks the pair
    return (
        <Box className={classes.codeArea}>
            {pair.length === 2 ? (
                <Box className={classes.codePair}>
                    {pair.map((file) => (
                        <Box
                            key={file}
                            className={classes.codePairSide}
                            data-open={file === path || undefined}
                        >
                            {render(file)}
                        </Box>
                    ))}
                </Box>
            ) : (
                render(null)
            )}
        </Box>
    );
};

/** Prototype: two views of the same thing, one click apart. Model is what people query; Code is the files that make it, and every other file in the project. */
export const ProtoViewDock: FC<DockProps> = (props) => {
    const keepsDraft = useKeepsSemanticLayerDraft(props.projectUuid);
    const { onOpenFiles, modelName } = props;
    return keepsDraft ? (
        <DockButtons
            view={props.view}
            onModel={props.onModel}
            onActionsSlot={props.onActionsSlot}
            onCode={
                onOpenFiles
                    ? () =>
                          onOpenFiles({
                              model: modelName ?? '',
                              path: null,
                              field: protoPlace.openField,
                          })
                    : null
            }
        />
    ) : (
        <RepositoryDock {...props} />
    );
};

type ModelProps = {
    view: ViewModel;
    explore: Explore;
    code: CodeBeside;
};

const extensionOf = (name: string) => name.split('.').pop() ?? '';

// The repository's editor opens the file the address names, so the address follows the button
const PathParam: FC<{ path: string | null }> = ({ path }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const current = searchParams.get(SOURCE_PARAM);
    useEffect(() => {
        if (current === path) return;
        setSearchParams(
            (previous) => {
                const next = new URLSearchParams(previous);
                if (path) next.set(SOURCE_PARAM, path);
                else next.delete(SOURCE_PARAM);
                return next;
            },
            { replace: true },
        );
    }, [current, path, setSearchParams]);
    return null;
};

/** A dbt model's files are in the repository, found by the model's name. */
const DbtModel: FC<ModelProps> = (props) => {
    const { data } = useStudioSources(props.view.project.id, null, null);
    const files = (data?.files ?? []).filter(
        (path) => modelNameOfSourcePath(path) === props.explore.name,
    );
    const open =
        files.find((path) => extensionOf(path) === props.code.extension) ??
        null;
    return (
        <>
            {props.code.render ? <PathParam path={open} /> : null}
            <ProtoModel
                {...props}
                files={files.map((path) => ({
                    model: props.explore.name,
                    path,
                    field: null,
                }))}
            />
        </>
    );
};

const ProtoModel: FC<ModelProps & { files: FilesTarget[] }> = ({
    view,
    explore,
    code,
    files,
}) => {
    const nameOf = (file: FilesTarget) =>
        file.path ? baseName(file.path) : `${file.model}.yml`;
    const openFile =
        code.render === null
            ? null
            : (files.find(
                  (file) => extensionOf(nameOf(file)) === code.extension,
              ) ?? null);
    const projectUuid = view.project.id;
    const [open, setOpenId] = useState<string | null>(null);
    const { schemas } = useCatalogTables(projectUuid);
    // Found by name, as the catalog matching does when a model doesn't say which table it reads
    const source = schemas.find(({ tables }) => explore.name in tables);
    const { data: columns } = useTableFields({
        projectUuid,
        tableName: source ? explore.name : undefined,
        schema: source ? String(source.schema) : undefined,
        search: undefined,
    });
    const draft = findCheckedOutModel(useStudioCheckout().shown, explore.id);
    const { fields } = useExploreFields({
        projectUuid,
        explore,
        source: getSource(view.project, explore.sourceId),
        canManageLive: view.permissions.live,
        draft,
    });
    const all = fields ?? [];
    const setOpen = (id: string | null) => {
        protoPlace.openField =
            all.find((field) => field.id === id)?.name ?? null;
        setOpenId(id);
    };
    // Back from the code, the field the caret was in opens; a new model starts with none open
    const list = useRef<HTMLDivElement>(null);
    const isLoaded = fields !== undefined;
    useEffect(() => {
        if (!isLoaded) return;
        const { arrive, caret } = protoPlace;
        protoPlace.arrive = null;
        protoPlace.caret = null;
        protoPlace.openField = null;
        const mine = all.filter((field) => field.table === explore.name);
        const inCaret =
            caret && modelNameOfSourcePath(caret.path) === explore.name
                ? mine
                      .map((field) => ({
                          field,
                          block: findFieldBlock(caret.text, field.name),
                      }))
                      .filter(
                          ({ block }) =>
                              block &&
                              block.start <= caret.line &&
                              caret.line <= block.end,
                      )
                      .sort(
                          (a, b) =>
                              (a.block?.end ?? 0) -
                              (a.block?.start ?? 0) -
                              ((b.block?.end ?? 0) - (b.block?.start ?? 0)),
                      )[0]?.field
                : undefined;
        const target =
            inCaret ?? mine.find((field) => field.name === arrive) ?? null;
        if (!target) return;
        protoPlace.openField = target.name;
        setOpenId(target.id);
        requestAnimationFrame(() =>
            list.current
                ?.querySelector(`[data-field="${target.id}"]`)
                ?.scrollIntoView({ block: 'center' }),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded]);
    const unsavedFields = useUnsavedFields(projectUuid, explore.name);
    const [filter, setFilter] = useState('');
    const needle = filter.trim().toLowerCase();
    // The model's own fields first, then each joined table's; dimensions before metrics
    const own = all
        .filter(({ label, name }) =>
            `${label} ${name}`.toLowerCase().includes(needle),
        )
        .sort(
            (a, b) =>
                Number(a.table !== explore.name) -
                    Number(b.table !== explore.name) ||
                a.table.localeCompare(b.table) ||
                Number(a.fieldKind === 'metric') -
                    Number(b.fieldKind === 'metric'),
        );
    const typeOf = new Map(
        (columns ?? []).map(({ name, type }) => [name, type]),
    );
    return (
        <Box className={classes.object}>
            <Box className={classes.pane} ref={list}>
                <Box className={classes.header}>
                    <Title order={3} className={classes.title}>
                        {explore.label}
                    </Title>
                    {source ? (
                        <TableTitle
                            reference={`${source.schema}.${explore.name}`}
                        />
                    ) : null}
                    <Description text={explore.description} />
                </Box>
                <Box className={classes.listHead}>
                    <TextInput
                        variant="unstyled"
                        size="xs"
                        className={classes.listFilter}
                        placeholder={`Filter ${all.length} fields`}
                        aria-label="Filter fields"
                        leftSection={
                            <MantineIcon icon={IconSearch} size={13} />
                        }
                        value={filter}
                        onChange={(event) =>
                            setFilter(event.currentTarget.value)
                        }
                    />
                    <span>Description</span>
                    <span>Source</span>
                </Box>
                {own.map((field) => {
                    const isOpen = open === field.id;
                    const yml = files.find(
                        (file) => extensionOf(nameOf(file)) === 'yml',
                    );
                    const columnType = typeOf.get(field.name);
                    return (
                        <Box key={field.id} data-field={field.id}>
                            <button
                                type="button"
                                className={classes.line}
                                aria-expanded={isOpen}
                                onClick={() =>
                                    setOpen(isOpen ? null : field.id)
                                }
                            >
                                <Box className={classes.name}>
                                    <FieldTypeIcon field={field} />
                                    <Text
                                        truncate
                                        inherit
                                        td={
                                            field.draftState === 'removed'
                                                ? 'line-through'
                                                : undefined
                                        }
                                    >
                                        {field.label}
                                    </Text>
                                    {unsavedFields.has(field.name) ? (
                                        <span className={classes.changeTag}>
                                            Not saved
                                        </span>
                                    ) : null}
                                    {field.draftState ? (
                                        <span
                                            className={classes.changeTag}
                                            data-change={field.draftState}
                                        >
                                            {
                                                CHANGE_KIND_LABELS[
                                                    field.draftState
                                                ]
                                            }
                                        </span>
                                    ) : null}
                                </Box>
                                <TruncatedText
                                    fz={13}
                                    maxWidth="100%"
                                    inherit
                                    c="dimmed"
                                    tooltipMaxWidth={420}
                                    tooltipOpenDelay={400}
                                >
                                    {field.description}
                                </TruncatedText>
                                <span className={classes.origin}>
                                    {field.table !== explore.name
                                        ? `${field.table}.${field.name}`
                                        : field.fieldKind === 'dimension' &&
                                            columnType
                                          ? `${field.name} · ${columnType}`
                                          : field.definition.value}
                                </span>
                            </button>
                            {isOpen ? (
                                <FieldForm
                                    field={field}
                                    explore={explore}
                                    code={(words, actions) => (
                                        <ProtoFieldCode
                                            fieldName={field.name}
                                            projectUuid={projectUuid}
                                            modelName={explore.name}
                                            path={yml?.path ?? null}
                                            dbt={yml ? code.dbt : null}
                                            readOnlyReason={code.readOnlyReason}
                                            words={words}
                                            actions={actions}
                                            hasFile={yml !== undefined}
                                        />
                                    )}
                                />
                            ) : null}
                        </Box>
                    );
                })}
            </Box>
            {openFile && code.render ? (
                <Box
                    className={classes.codeSheet}
                    data-wide={code.isWide || undefined}
                    role="complementary"
                    aria-label={`${explore.label} code`}
                    onKeyDown={(event) => {
                        // Escape closes the sheet from its own bar; inside the editor it belongs to the editor
                        if (
                            event.key === 'Escape' &&
                            event.target instanceof HTMLElement &&
                            event.target.closest('[data-sheet-bar]')
                        ) {
                            code.onChange(null);
                        }
                    }}
                >
                    <Box className={classes.codeSheetBar} data-sheet-bar>
                        {code.isWide ? (
                            <Text fz="sm" fw={600} mr={8}>
                                {explore.label}
                            </Text>
                        ) : null}
                        {files.map((file) => {
                            const name = nameOf(file);
                            return (
                                <button
                                    key={name}
                                    type="button"
                                    className={classes.codeSheetTab}
                                    aria-pressed={file === openFile}
                                    onClick={() =>
                                        code.onChange(extensionOf(name))
                                    }
                                >
                                    {name}
                                </button>
                            );
                        })}
                        <ActionIcon
                            ml="auto"
                            size="sm"
                            variant="subtle"
                            color="gray"
                            aria-label="Close code"
                            onClick={() => code.onChange(null)}
                        >
                            <MantineIcon icon={IconX} size={14} />
                        </ActionIcon>
                    </Box>
                    <Box className={classes.codeSheetBody}>
                        {code.render(openFile)}
                    </Box>
                </Box>
            ) : null}
        </Box>
    );
};

/** Prototype: with nothing open, the page says where the semantic layer stands and what is worth doing next. */
const ProtoHome: FC<{ view: ViewModel }> = ({ view }) => {
    const { unmodelled } = useCatalogTables(view.project.id);
    const models = view.project.explores;
    const tableCount = unmodelled.reduce(
        (sum, { tables }) => sum + Object.keys(tables).length,
        0,
    );
    const open = (exploreId: string) =>
        view.select({ type: 'explore', exploreId });
    const drafted = useContext(DraftMarksContext).kinds;
    const inDraft = models.filter(({ id }) => drafted.has(id));
    const groups = [
        {
            title: 'In your draft',
            models: inDraft,
            note: (model: Explore) =>
                drafted.get(model.id) === 'new'
                    ? 'New, not published yet'
                    : 'Changed, not published yet',
        },
        {
            title: 'With warnings',
            models: models.filter(({ warnings }) => warnings.length > 0),
            note: (model: Explore) => model.warnings[0],
        },
        {
            title: 'No description',
            models: models.filter(
                ({ description }) => description.trim() === '',
            ),
            note: () => 'People and the agent only have its name to go on',
        },
    ].filter((group) => group.models.length > 0);
    return (
        <Box className={classes.object}>
            <Box className={classes.pane}>
                <Box className={classes.header}>
                    <Title order={3}>{view.project.name}</Title>
                    <Text fz="sm" c="dimmed">
                        {models.length === 0
                            ? tableCount > 0
                                ? `No models yet. ${tableCount} warehouse ${tableCount === 1 ? 'table is' : 'tables are'} ready to model: open one from the sidebar, or ask in the chat.`
                                : 'No models yet. Ask in the chat to build the first one.'
                            : `${models.length} ${models.length === 1 ? 'model' : 'models'}. ${
                                  tableCount > 0
                                      ? `${tableCount} warehouse ${tableCount === 1 ? 'table has' : 'tables have'} no model yet.`
                                      : 'Every warehouse table has a model.'
                              }`}
                    </Text>
                </Box>
                <Box mb="md">
                    {view.tree.nodes.length > 0 ? (
                        <Text fz="sm" fw={500} px={24} py={8}>
                            Sources
                        </Text>
                    ) : null}
                    {view.tree.nodes.map((node) => (
                        <button
                            key={node.key}
                            type="button"
                            className={classes.line}
                            onClick={() => view.select(node.ref)}
                        >
                            <Box className={classes.name}>
                                <NodeIcon
                                    project={view.project}
                                    nodeRef={node.ref}
                                    size={14}
                                />
                                <Text truncate inherit>
                                    {node.label}
                                </Text>
                            </Box>
                            <Text truncate inherit c="dimmed">
                                {node.exploreCount}{' '}
                                {node.exploreCount === 1 ? 'model' : 'models'}
                            </Text>
                            <span />
                        </button>
                    ))}
                </Box>
                {groups.map((group) => (
                    <Box key={group.title} mb="md">
                        <Text fz="sm" fw={500} px={24} py={8}>
                            {group.title}
                            <Text span c="dimmed" inherit fw={400}>
                                {' '}
                                {group.models.length}
                            </Text>
                        </Text>
                        {group.models.map((model) => (
                            <button
                                key={model.id}
                                type="button"
                                className={classes.line}
                                onClick={() => open(model.id)}
                            >
                                <Box className={classes.name}>
                                    <NodeIcon
                                        project={view.project}
                                        nodeRef={{
                                            type: 'explore',
                                            exploreId: model.id,
                                        }}
                                        size={14}
                                    />
                                    <Text truncate inherit>
                                        {model.label}
                                    </Text>
                                </Box>
                                <Text truncate inherit c="dimmed">
                                    {group.note(model)}
                                </Text>
                                <span className={classes.origin}>
                                    {model.name}
                                </span>
                            </button>
                        ))}
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

/** Prototype: the open thing on one page; a model lists what it calls each column, what it means and where it comes from. */
export const ProtoMain: FC<{
    view: ViewModel;
    openTable: string | null;
    fallback: ReactNode;
    code: CodeBeside;
}> = ({ view, openTable, fallback, code }) => {
    const keepsDraft = useKeepsSemanticLayerDraft(view.project.id);
    if (openTable !== null) {
        return (
            <Box className={classes.object}>
                <ProtoTable view={view} reference={openTable} />
            </Box>
        );
    }
    const exploreId = selectedExploreId(view);
    if (exploreId === null) {
        return view.selected === null ? (
            <ProtoHome view={view} />
        ) : (
            <>{fallback}</>
        );
    }
    const explore = getExplore(view.project, exploreId);
    // Only the warehouse's models are files; a live source or an upload keeps its own page
    if (getSource(view.project, explore.sourceId).kind !== 'modelled') {
        return <>{fallback}</>;
    }
    const props = { view, explore, code };
    // With no code view there are no files to look for
    return keepsDraft || code.open === null ? (
        <ProtoModel
            key={exploreId}
            {...props}
            files={
                keepsDraft
                    ? [{ model: explore.name, path: null, field: null }]
                    : []
            }
        />
    ) : (
        <DbtModel key={exploreId} {...props} />
    );
};
