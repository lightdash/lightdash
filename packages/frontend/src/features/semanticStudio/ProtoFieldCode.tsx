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
import { Fragment, useEffect, useState, type FC, type ReactNode } from 'react';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
    pierreThemeFor,
} from '../writeback/pierreDiffConfig';
import { findFieldBlock } from './modelCode';
import { createEditor, MOD_KEY } from './pierreEditor';
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
    source: Source;
    words: FieldWord[];
    actions: ReactNode;
}> = ({ fieldName, source, words, actions }) => {
    const colorScheme = useComputedColorScheme('light');
    const [text, setText] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);
    const [mount, setMount] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);
    // What the editor was last drawn from; typing in a property redraws it a moment later
    const [seed, setSeed] = useState<string | null>(null);
    const [typing, setTyping] = useState<{ key: string; value: string } | null>(
        null,
    );
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
        return <ReadOnlyWords words={words} />;
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
    const submit = () => {
        if (!isDirty || source.isBusy || text === null) return;
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
                if (error === null) setSaved(typed);
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
                            setTyping({ key, value });
                            setText(
                                writeProperty(current, key, value, isDbtColumn),
                            );
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
                        {isDirty ? (
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
    words: FieldWord[];
    actions: ReactNode;
}> = ({ fieldName, path, edit: { target, onSaved }, words, actions }) => {
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
    words: FieldWord[];
    actions: ReactNode;
}> = ({
    fieldName,
    projectUuid,
    modelName,
    readOnlyReason,
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
const ReadOnlyWords: FC<{ words: FieldWord[] }> = ({ words }) => (
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
    hasFile,
}) =>
    !hasFile ? (
        <ReadOnlyWords words={words} />
    ) : path === null ? (
        <DraftFieldCode
            fieldName={fieldName}
            projectUuid={projectUuid}
            modelName={modelName}
            readOnlyReason={readOnlyReason}
            words={words}
            actions={actions}
        />
    ) : dbt ? (
        <DbtFieldCode
            fieldName={fieldName}
            path={path}
            edit={dbt}
            words={words}
            actions={actions}
        />
    ) : (
        <ReadOnlyWords words={words} />
    );
