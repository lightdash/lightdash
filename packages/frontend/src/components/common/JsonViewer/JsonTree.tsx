import {
    getTreeExpandedState,
    Tree,
    useTree,
    type TreeNodeData,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { CopyActionIcon } from '../CopyActionIcon';
import MantineIcon from '../MantineIcon';
import classes from './JsonTree.module.css';

type JsonKey = string | number;

type JsonNode = {
    key: JsonKey;
    data: unknown;
    path: string;
};

type Props = {
    value: unknown;
    /** Levels open on mount: 0 shows only top-level keys */
    expandDepth: number;
    withCopy: boolean;
    onSelectPath: ((path: string) => void) | null;
};

const getJsonPath = (keys: JsonKey[]) =>
    keys.reduce<string>((acc, part) => {
        const key = String(part);
        return /^\d+$/.test(key) ? `${acc}[${key}]` : `${acc}.${key}`;
    }, '$');

const isContainer = (data: unknown): data is object =>
    data !== null && typeof data === 'object';

const getEntries = (data: object): [JsonKey, unknown][] =>
    Array.isArray(data)
        ? data.map((item, index) => [index, item])
        : Object.entries(data);

const buildTree = (root: unknown, expandDepth: number) => {
    const nodes = new Map<string, JsonNode>();
    const expanded: string[] = [];

    const build = (data: object, keys: JsonKey[]): TreeNodeData[] =>
        getEntries(data).map(([key, child]) => {
            const path = [...keys, key];
            // Key arrays stay unique where display paths can collide ("a.b")
            const value = JSON.stringify(path);
            nodes.set(value, { key, data: child, path: getJsonPath(path) });
            if (!isContainer(child)) return { value, label: String(key) };
            if (keys.length < expandDepth) expanded.push(value);
            return { value, label: String(key), children: build(child, path) };
        });

    const data = isContainer(root) ? build(root, []) : [];
    return { data, nodes, expanded };
};

const getSummary = (data: object) =>
    Array.isArray(data) ? `[${data.length}]` : `{${Object.keys(data).length}}`;

const getScalarClass = (data: unknown) => {
    if (typeof data === 'string') return classes.string;
    if (typeof data === 'number' || typeof data === 'bigint')
        return classes.number;
    if (typeof data === 'boolean') return classes.boolean;
    return classes.null;
};

const JsonValue: FC<{ data: unknown }> = ({ data }) =>
    isContainer(data) ? (
        <span className={classes.summary}>{getSummary(data)}</span>
    ) : (
        <span className={getScalarClass(data)}>
            {data === undefined ? 'undefined' : JSON.stringify(data)}
        </span>
    );

const JsonTree: FC<Props> = ({
    value,
    expandDepth,
    withCopy,
    onSelectPath,
}) => {
    const { data, nodes, expanded } = useMemo(
        () => buildTree(value, expandDepth),
        [value, expandDepth],
    );
    const tree = useTree({
        initialExpandedState: getTreeExpandedState(data, expanded),
    });

    return (
        <Tree
            className={classes.tree}
            data={data}
            tree={tree}
            levelOffset="md"
            renderNode={({ node, expanded: isExpanded, elementProps }) => {
                const jsonNode = nodes.get(node.value);
                if (!jsonNode) return null;
                const hasChildren = isContainer(jsonNode.data);
                return (
                    <div
                        {...elementProps}
                        onClick={(event) => {
                            elementProps.onClick(event);
                            onSelectPath?.(jsonNode.path);
                        }}
                    >
                        <span className={classes.row}>
                            <span className={classes.chevron}>
                                {hasChildren && (
                                    <MantineIcon
                                        icon={
                                            isExpanded
                                                ? IconChevronDown
                                                : IconChevronRight
                                        }
                                        size={12}
                                    />
                                )}
                            </span>
                            <span className={classes.key}>{jsonNode.key}:</span>
                            <JsonValue data={jsonNode.data} />
                            {withCopy && (
                                <span
                                    className={classes.copy}
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <CopyActionIcon
                                        value={JSON.stringify(
                                            jsonNode.data,
                                            null,
                                            2,
                                        )}
                                        size="xs"
                                    />
                                </span>
                            )}
                        </span>
                    </div>
                );
            }}
        />
    );
};

export default JsonTree;
