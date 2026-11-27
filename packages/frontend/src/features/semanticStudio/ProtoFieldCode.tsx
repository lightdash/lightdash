import {
    Anchor,
    Box,
    Text,
    Textarea,
    useComputedColorScheme,
} from '@mantine/core';
import {
    EditProvider,
    File,
    WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import {
    Fragment,
    useEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
    pierreThemeFor,
} from '../writeback/pierreDiffConfig';
import { countFieldLines, findFieldBlock } from './modelCode';
import { createEditor, MOD_KEY } from './pierreEditor';
import { keep, readUnsaved } from './protoUnsaved';
import { readProperty, writeProperty } from './protoYaml';
import { type SourcesTarget } from './SourcesView';
import { type StoredThread } from './studioChange';
import classes from './StudioProto.module.css';
import {
    useSaveDraftModel,
    useSemanticLayerModel,
} from './useSemanticLayerModel';
import { findCheckedOutModel, useStudioCheckout } from './useStudioCheckout';
import { useSaveStudioSource, useStudioSourceFile } from './useStudioSources';

const SEE_THROUGH_CSS = `:host, pre, code, [data-code], [data-line], [data-column-content], [data-gutter] { background: transparent !important; --diffs-bg: transparent !important; }`;

/** How the dbt code view reads and saves a file, lent to the model page. */
export type DbtEdit = {
    target: SourcesTarget;
    onSaved: (prUrl: string, thread: StoredThread | null) => void;
};

/** A property people fill in without thinking of it as code; it is read from and written into the field's YAML. */
export type FieldWord = {
    name: string;
    key: string;
    placeholder: string;
    /** What the compiled field says, shown where the YAML cannot be read. */
    fallback: string;
};

type Source = {
    fileName: string;
    /** A dbt file keeps a column's words under meta; the app's own YAML keeps them on the field. */
    isRepository: boolean;
    content: string | null;
    readOnlyReason: string | null;
    isBusy: boolean;
    /** Saves the whole file; calls back with why it failed, or null. */
    save: (content: string, done: (error: string | null) => void) => void;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

// The field's own lines from its file, typed into where the field is and saved back into the file
const FieldCodeEditor: FC<{
    fieldName: string;
    /** Names this field's unsaved typing across the page. */
    draftKey: string;
    source: Source;
    words: FieldWord[];
    actions: ReactNode;
}> = ({ fieldName, draftKey, source, words, actions }) => {
    const colorScheme = useComputedColorScheme('light');
    const [text, setTextOnly] = useState<string | null>(
        () => readUnsaved(draftKey)?.text ?? null,
    );
    // The field's text when the typing began: a save is only made onto the text it was typed over
    const [base, setBase] = useState<string | null>(
        () => readUnsaved(draftKey)?.base ?? null,
    );
    const [saved, setSaved] = useState<string | null>(null);
    const [mount, setMount] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);
    // What the editor was last drawn from; typing in a property redraws it a moment later
    const [seed, setSeed] = useState<string | null>(
        () => readUnsaved(draftKey)?.text ?? null,
    );
    const [typing, setTyping] = useState<{ key: string; value: string } | null>(
        null,
    );
    const latest = useRef(text);
    latest.current = text;
    useEffect(() => {
        if (text === null || text === seed || typing === null) return undefined;
        const timer = window.setTimeout(() => {
            setSeed(text);
            setMount((current) => current + 1);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [text, seed, typing]);
    const { content } = source;
    const block = content ? findFieldBlock(content, fieldName) : null;
    if (!content || !block) {
        return <ReadOnlyWords words={words} note={null} />;
    }
    // A name defined twice in one file, such as a column in two models, cannot be told apart here
    if (countFieldLines(content, fieldName) > 1) {
        return (
            <ReadOnlyWords
                words={words}
                note={`${fieldName} is defined more than once in ${source.fileName}, so it is edited in the Code view.`}
            />
        );
    }
    const lines = content.split('\n');
    const own = lines.slice(block.start - 1, block.end);
    const indent = Math.min(
        ...own.filter((line) => line.trim() !== '').map(indentOf),
    );
    const shown = own.map((line) => line.slice(indent)).join('\n');
    const isDirty = text !== null && text !== (saved ?? shown);
    const canEdit = source.readOnlyReason === null;
    const current = text ?? shown;
    const isDbtColumn =
        source.isRepository && current.trimStart().startsWith('- ');
    // Someone else, or the agent, changed this field after the typing began
    const hasMoved = base !== null && base !== shown && base !== saved;
    const setText = (next: string | null) => {
        const from = next === null ? null : (base ?? saved ?? shown);
        keep(
            draftKey,
            next === null || from === null ? null : { text: next, base: from },
        );
        setBase(from);
        setTextOnly(next);
    };
    // A property is rewritten here only when the result is the same YAML with that one value changed
    const rewrite = (key: string, value: string): string | null => {
        const next = writeProperty(current, key, value, isDbtColumn);
        const comments = (yaml: string) =>
            yaml.split('\n').filter((line) => /(^|\s)#/.test(line)).length;
        const reads = readProperty(next, key, isDbtColumn);
        return reads === value.replace(/\n+$/, '') &&
            comments(next) >= comments(current)
            ? next
            : null;
    };
    const submit = () => {
        if (!isDirty || source.isBusy || text === null || !canEdit) return;
        if (hasMoved) {
            setNotice(
                'This field changed since you started typing. Discard to load the latest, then make your edit again.',
            );
            return;
        }
        const typed = text;
        const pad = ' '.repeat(indent);
        setNotice('Saving…');
        source.save(
            [
                ...lines.slice(0, block.start - 1),
                ...typed
                    .split('\n')
                    .map((line) => (line.trim() === '' ? line : pad + line)),
                ...lines.slice(block.end),
            ].join('\n'),
            (error) => {
                if (error === null) {
                    setSaved(typed);
                    // Typed on while it saved: that typing stays, now over what was just saved
                    const typedOn =
                        latest.current !== null && latest.current !== typed;
                    keep(
                        draftKey,
                        typedOn && latest.current !== null
                            ? { text: latest.current, base: typed }
                            : null,
                    );
                    setBase(typedOn ? typed : null);
                }
                setNotice(error ?? 'Saved');
            },
        );
    };
    return (
        <>
            {words.map(({ name, key, placeholder, fallback }) => (
                <Fragment key={name}>
                    <span className={classes.term}>{name}</span>
                    <Textarea
                        variant="unstyled"
                        className={classes.value}
                        aria-label={name}
                        // An unset word shows what the field falls back to, such as the label made from its name
                        placeholder={fallback || placeholder}
                        autosize
                        minRows={1}
                        maxRows={6}
                        readOnly={!canEdit}
                        value={
                            typing?.key === key
                                ? typing.value
                                : readProperty(current, key, isDbtColumn)
                        }
                        onChange={(event) => {
                            const { value } = event.currentTarget;
                            const next = rewrite(key, value);
                            if (next === null) {
                                setNotice(
                                    'This one is edited in the code below: rewriting it from here would change other lines.',
                                );
                                return;
                            }
                            setTyping({ key, value });
                            setText(next);
                            setNotice(null);
                        }}
                        onBlur={() => {
                            setTyping(null);
                            if (text !== null && text !== seed) {
                                setSeed(text);
                                setMount(mount + 1);
                            }
                        }}
                    />
                </Fragment>
            ))}
            <span className={classes.term} data-after>
                Code
            </span>
            <Box
                className={classes.fieldCode}
                data-after
                onKeyDownCapture={(event) => {
                    if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key.toLowerCase() === 's'
                    ) {
                        event.preventDefault();
                        submit();
                    }
                }}
            >
                <Box className={classes.fieldCodeBody}>
                    <WorkerPoolContextProvider
                        poolOptions={PIERRE_POOL_OPTIONS}
                        highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                    >
                        <EditProvider createEditor={createEditor}>
                            <File
                                key={mount}
                                file={{
                                    name: source.fileName,
                                    contents: seed ?? shown,
                                }}
                                options={{
                                    ...pierreThemeFor(colorScheme),
                                    overflow: 'wrap',
                                    disableFileHeader: true,
                                    disableLineNumbers: true,
                                    // The surface behind the code is the panel's, not the theme's
                                    unsafeCSS: SEE_THROUGH_CSS,
                                }}
                                edit={canEdit}
                                onEditChange={(event) => {
                                    setText(event.file.contents);
                                    setNotice(null);
                                }}
                                onEditComplete={() => 'accept'}
                            />
                        </EditProvider>
                    </WorkerPoolContextProvider>
                </Box>
                <Box className={classes.fieldCodeFoot}>
                    <Text
                        fz={12}
                        c="dimmed"
                        truncate
                        ff={
                            notice || source.readOnlyReason
                                ? undefined
                                : 'monospace'
                        }
                    >
                        {notice ?? source.readOnlyReason ?? source.fileName}
                    </Text>
                    <Box className={classes.fieldCodeActions}>
                        {isDirty && canEdit ? (
                            <>
                                <Anchor
                                    component="button"
                                    fw={500}
                                    disabled={source.isBusy}
                                    onClick={submit}
                                >
                                    Save {MOD_KEY}S
                                </Anchor>
                                <Anchor
                                    component="button"
                                    c="dimmed"
                                    onClick={() => {
                                        setText(null);
                                        setSeed(null);
                                        setSaved(null);
                                        setNotice(null);
                                        setMount(mount + 1);
                                    }}
                                >
                                    Discard
                                </Anchor>
                            </>
                        ) : (
                            actions
                        )}
                    </Box>
                </Box>
            </Box>
        </>
    );
};

const DbtFieldCode: FC<{
    fieldName: string;
    path: string;
    edit: DbtEdit;
    draftKey: string;
    words: FieldWord[];
    actions: ReactNode;
}> = ({
    fieldName,
    path,
    edit: { target, onSaved },
    draftKey,
    words,
    actions,
}) => {
    const { data: file, isFetching } = useStudioSourceFile(
        target.projectUuid,
        target.prUrl,
        target.head,
        path,
    );
    const save = useSaveStudioSource(target.projectUuid, target.startThread);
    return (
        <FieldCodeEditor
            fieldName={fieldName}
            draftKey={draftKey}
            words={words}
            actions={actions}
            source={{
                fileName: path.split('/').pop() ?? path,
                isRepository: true,
                content: file?.content ?? null,
                readOnlyReason: target.readOnlyReason,
                isBusy: save.isLoading || isFetching,
                save: (content, done) =>
                    save.mutate(
                        {
                            path,
                            content,
                            revision: file?.revision ?? null,
                            prUrl: target.prUrl,
                            threadUuid: target.threadUuid,
                            newChangeAgentUuid: target.newChangeAgentUuid,
                        },
                        {
                            onSuccess: (result) => {
                                if (result.status === 'failed')
                                    return done(result.error);
                                done(null);
                                onSaved(result.prUrl, result.thread);
                            },
                            onError: ({ error }) => done(error.message),
                        },
                    ),
            }}
        />
    );
};

const DraftFieldCode: FC<{
    fieldName: string;
    projectUuid: string;
    modelName: string;
    readOnlyReason: string | null;
    draftKey: string;
    words: FieldWord[];
    actions: ReactNode;
}> = ({
    fieldName,
    projectUuid,
    modelName,
    readOnlyReason,
    draftKey,
    words,
    actions,
}) => {
    const { data: model } = useSemanticLayerModel(projectUuid, modelName);
    const drafted = findCheckedOutModel(useStudioCheckout().shown, modelName);
    const content = drafted ? drafted.contentAfter : (model?.content ?? null);
    const save = useSaveDraftModel(projectUuid);
    return (
        <FieldCodeEditor
            fieldName={fieldName}
            draftKey={draftKey}
            words={words}
            actions={actions}
            source={{
                fileName: `${modelName}.yml`,
                isRepository: false,
                content,
                readOnlyReason,
                isBusy: save.isLoading,
                save: (next, done) =>
                    save.mutate(
                        {
                            model: modelName,
                            base: content ?? '',
                            content: next,
                        },
                        {
                            onSuccess: (result) =>
                                done(
                                    result.status === 'failed'
                                        ? result.error
                                        : null,
                                ),
                            onError: ({ error }) => done(error.message),
                        },
                    ),
            }}
        />
    );
};

// Where the YAML cannot be read, the compiled field's words are shown as they are
const ReadOnlyWords: FC<{ words: FieldWord[]; note: string | null }> = ({
    words,
    note,
}) => (
    <>
        {words.map(({ name, fallback, placeholder }) => (
            <Fragment key={name}>
                <span className={classes.term}>{name}</span>
                <Text
                    className={classes.facts}
                    c={fallback ? undefined : 'dimmed'}
                >
                    {fallback || placeholder}
                </Text>
            </Fragment>
        ))}
        {note ? (
            <>
                <span />
                <Text className={classes.facts}>{note}</Text>
            </>
        ) : null}
    </>
);

/** Prototype: a field's words and its lines of YAML under its row, edited and saved without leaving the model. */
export const ProtoFieldCode: FC<{
    fieldName: string;
    projectUuid: string;
    modelName: string;
    /** The repository file that defines the field; null on a project that keeps its YAML in the app. */
    path: string | null;
    dbt: DbtEdit | null;
    readOnlyReason: string | null;
    words: FieldWord[];
    /** What can be done with the field, shown at the foot of its code. */
    actions: ReactNode;
    /** The project, draft and model the field's unsaved typing belongs to. */
    draftScope: string;
    /** False where the model has no YAML file to read. */
    hasFile: boolean;
}> = ({
    fieldName,
    projectUuid,
    modelName,
    path,
    dbt,
    readOnlyReason,
    words,
    actions,
    draftScope,
    hasFile,
}) =>
    !hasFile ? (
        <ReadOnlyWords words={words} note={null} />
    ) : path === null ? (
        <DraftFieldCode
            fieldName={fieldName}
            projectUuid={projectUuid}
            modelName={modelName}
            readOnlyReason={readOnlyReason}
            draftKey={`${draftScope}:${fieldName}`}
            words={words}
            actions={actions}
        />
    ) : dbt ? (
        <DbtFieldCode
            fieldName={fieldName}
            path={path}
            edit={dbt}
            draftKey={`${draftScope}:${fieldName}`}
            words={words}
            actions={actions}
        />
    ) : (
        <ReadOnlyWords words={words} note={null} />
    );
