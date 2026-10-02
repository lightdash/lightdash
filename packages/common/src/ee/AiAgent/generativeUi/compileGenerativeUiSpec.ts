import assertUnreachable from '../../../utils/assertUnreachable';
import {
    GENERATIVE_UI_LIMITS,
    parseGenerativeUiRef,
    type GenerativeUiBlock,
    type GenerativeUiHttpMethod,
    type GenerativeUiLeafBlock,
    type GenerativeUiOptions,
    type GenerativeUiParams,
    type GenerativeUiRef,
    type GenerativeUiRefTarget,
    type GenerativeUiSpec,
    type GenerativeUiStep,
    type GenerativeUiValue,
} from '../schemas/tools/toolGenerateUiArgs';
import { GENERATIVE_UI_ALLOWED_OPERATION_IDS } from './allowedOperations';

export type GenerativeUiOperation = {
    operationId: string;
    method: GenerativeUiHttpMethod;
    pathTemplate: string;
};

export type ApiGenerativeUiOperationsResponse = {
    status: 'ok';
    results: GenerativeUiOperation[];
};

export type GenerativeUiCompiledRequest = {
    operation: GenerativeUiOperation;
    params: {
        path: Record<string, GenerativeUiValue>;
        query: Record<string, GenerativeUiValue>;
        body: GenerativeUiValue | undefined;
    };
};

export type GenerativeUiCompiledSpec = {
    spec: GenerativeUiSpec;
    queries: Array<GenerativeUiCompiledRequest & { id: string }>;
    steps: Array<GenerativeUiCompiledRequest & { step: GenerativeUiStep }>;
};

export type GenerativeUiCompileResult =
    | { ok: true; compiled: GenerativeUiCompiledSpec }
    | { ok: false; problems: string[] };

type StateKeyKind = 'single' | 'multiple';

// leaf is null for stack and group containers.
type BlockEntry = {
    leaf: GenerativeUiLeafBlock | null;
    location: string;
    depth: number;
};

type LocatedRef = { ref: GenerativeUiRefTarget; location: string };

type RefScope =
    | { kind: 'query' }
    | {
          kind: 'step';
          earlierStepIds: ReadonlySet<string>;
          inForEach: boolean;
      };

const INJECTED_PATH_PARAM = 'projectUuid';

const pathParamNamesOf = (pathTemplate: string): string[] =>
    Array.from(pathTemplate.matchAll(/\{([^}]+)\}/g), (match) => match[1]);

const flattenBlocks = (
    blocks: GenerativeUiBlock[],
    location: string,
    depth: number,
): BlockEntry[] =>
    blocks.flatMap((block, index) => {
        const blockLocation = `${location}[${index}]`;
        switch (block.type) {
            case 'stack':
            case 'group':
                return [
                    { leaf: null, location: blockLocation, depth },
                    ...flattenBlocks(
                        block.children,
                        `${blockLocation}.children`,
                        depth + 1,
                    ),
                ];
            case 'heading':
            case 'text':
            case 'callout':
            case 'divider':
            case 'textInput':
            case 'textarea':
            case 'numberInput':
            case 'checkbox':
            case 'dateInput':
            case 'select':
            case 'multiSelect':
            case 'segmented':
            case 'table':
                return [{ leaf: block, location: blockLocation, depth }];
            default:
                return assertUnreachable(
                    block,
                    'Unknown generative UI block type',
                );
        }
    });

const stateKeyOf = (
    block: GenerativeUiLeafBlock,
): { key: string; kind: StateKeyKind; field: string } | null => {
    switch (block.type) {
        case 'textInput':
        case 'textarea':
        case 'numberInput':
        case 'checkbox':
        case 'dateInput':
        case 'select':
        case 'segmented':
            return { key: block.key, kind: 'single', field: 'key' };
        case 'multiSelect':
            return { key: block.key, kind: 'multiple', field: 'key' };
        case 'table':
            if (block.selectable === undefined) return null;
            return {
                key: block.selectable.key,
                kind: block.selectable.multiple ? 'multiple' : 'single',
                field: 'selectable.key',
            };
        case 'heading':
        case 'text':
        case 'callout':
        case 'divider':
            return null;
        default:
            return assertUnreachable(block, 'Unknown generative UI block type');
    }
};

/**
 * Checks a spec against the rules the schema cannot express and binds each
 * query and step to its operation, with projectUuid filled in.
 */
export const compileGenerativeUiSpec = (
    spec: GenerativeUiSpec,
    context: {
        operations: ReadonlyMap<string, GenerativeUiOperation>;
        projectUuid: string;
    },
): GenerativeUiCompileResult => {
    const problems: string[] = [];
    const report = (location: string, message: string) => {
        problems.push(`${location}: ${message}`);
    };

    const blocks = flattenBlocks(spec.blocks, 'blocks', 1);
    if (blocks.length > GENERATIVE_UI_LIMITS.maxBlocks) {
        report(
            'blocks',
            `${blocks.length} blocks in total; the limit is ${GENERATIVE_UI_LIMITS.maxBlocks}`,
        );
    }
    blocks
        .filter(({ depth }) => depth > GENERATIVE_UI_LIMITS.maxDepth)
        .forEach(({ location, depth }) =>
            report(
                location,
                `nested ${depth} deep; the limit is ${GENERATIVE_UI_LIMITS.maxDepth}`,
            ),
        );

    const leaves = blocks.flatMap(({ leaf, location }) =>
        leaf === null ? [] : [{ leaf, location }],
    );

    const stateKeys = new Map<string, StateKeyKind>();
    leaves.forEach(({ leaf, location }) => {
        const stateKey = stateKeyOf(leaf);
        if (stateKey === null) return;
        if (stateKeys.has(stateKey.key)) {
            report(
                `${location}.${stateKey.field}`,
                `duplicate key "${stateKey.key}"`,
            );
            return;
        }
        stateKeys.set(stateKey.key, stateKey.kind);
    });

    const queryIds = new Set(Object.keys(spec.queries ?? {}));
    if (queryIds.size > GENERATIVE_UI_LIMITS.maxQueries) {
        report(
            'queries',
            `${queryIds.size} queries; the limit is ${GENERATIVE_UI_LIMITS.maxQueries}`,
        );
    }

    const checkStateKey = (key: string, location: string) => {
        if (!stateKeys.has(key)) {
            report(
                location,
                `"${key}" is not the key of an input or table selection`,
            );
        }
    };

    const checkQueryId = (queryId: string, location: string) => {
        if (!queryIds.has(queryId)) {
            report(location, `"${queryId}" is not a declared query`);
        }
    };

    const checkOptions = (
        options: GenerativeUiOptions,
        location: string,
        initialValues: readonly string[],
    ) => {
        if (!Array.isArray(options)) {
            checkQueryId(options.$query, `${location}.options.$query`);
            return;
        }
        const values = new Set(options.map((option) => option.value));
        initialValues
            .filter((value) => !values.has(value))
            .forEach((value) =>
                report(
                    `${location}.initial`,
                    `"${value}" is not one of the option values`,
                ),
            );
    };

    leaves.forEach(({ leaf, location }) => {
        switch (leaf.type) {
            case 'heading':
            case 'text':
            case 'callout':
            case 'divider':
            case 'textInput':
            case 'textarea':
            case 'checkbox':
            case 'dateInput':
                break;
            case 'numberInput': {
                const { initial, min, max } = leaf;
                if (min !== undefined && max !== undefined && min > max) {
                    report(location, `min ${min} is greater than max ${max}`);
                }
                if (
                    initial !== undefined &&
                    ((min !== undefined && initial < min) ||
                        (max !== undefined && initial > max))
                ) {
                    report(`${location}.initial`, 'is outside min..max');
                }
                break;
            }
            case 'select':
                checkOptions(
                    leaf.options,
                    location,
                    leaf.initial === undefined ? [] : [leaf.initial],
                );
                break;
            case 'multiSelect':
                checkOptions(leaf.options, location, leaf.initial ?? []);
                break;
            case 'segmented':
                checkOptions(leaf.options, location, [leaf.initial]);
                break;
            case 'table': {
                const { rows, selectable } = leaf;
                if (!Array.isArray(rows)) {
                    checkQueryId(rows.$query, `${location}.rows.$query`);
                    break;
                }
                rows.forEach((row, index) => {
                    const rowLocation = `${location}.rows[${index}]`;
                    const keyCount = Object.keys(row).length;
                    if (keyCount > GENERATIVE_UI_LIMITS.maxStaticRowKeys) {
                        report(
                            rowLocation,
                            `${keyCount} keys; the limit is ${GENERATIVE_UI_LIMITS.maxStaticRowKeys}`,
                        );
                    }
                    if (selectable === undefined) return;
                    const rowId = row[selectable.rowKey];
                    if (
                        typeof rowId !== 'string' &&
                        typeof rowId !== 'number'
                    ) {
                        report(
                            rowLocation,
                            `needs a string or number "${selectable.rowKey}" (selectable.rowKey)`,
                        );
                    }
                });
                break;
            }
            default:
                assertUnreachable(leaf, 'Unknown generative UI block type');
        }
        if (leaf.visibleWhen !== undefined) {
            checkStateKey(
                leaf.visibleWhen.$state,
                `${location}.visibleWhen.$state`,
            );
        }
    });

    const valueRefs = (
        value: GenerativeUiValue,
        location: string,
    ): LocatedRef[] => {
        if (value === null || typeof value !== 'object') return [];
        if (Array.isArray(value)) {
            return value.flatMap((item, index) =>
                valueRefs(item, `${location}[${index}]`),
            );
        }
        const ref = parseGenerativeUiRef(value);
        if (ref !== null) return [{ ref, location }];
        return Object.entries(value).flatMap(([key, child]) => {
            if (key.startsWith('$')) {
                report(
                    `${location}.${key}`,
                    'keys starting with "$" are reserved for references; check the reference syntax',
                );
            }
            return child === undefined
                ? []
                : valueRefs(child, `${location}.${key}`);
        });
    };

    const paramRefs = (
        params: GenerativeUiParams | undefined,
        location: string,
    ): LocatedRef[] => [
        ...Object.entries(params?.path ?? {}).flatMap(([name, value]) =>
            valueRefs(value, `${location}.path.${name}`),
        ),
        ...Object.entries(params?.query ?? {}).flatMap(([name, value]) =>
            valueRefs(value, `${location}.query.${name}`),
        ),
        ...(params?.body === undefined
            ? []
            : valueRefs(params.body, `${location}.body`)),
    ];

    const refProblem = (
        ref: GenerativeUiRefTarget,
        scope: RefScope,
    ): string | null => {
        switch (ref.kind) {
            case 'state':
                return stateKeys.has(ref.key)
                    ? null
                    : `"${ref.key}" is not the key of an input or table selection`;
            case 'query':
                if (scope.kind === 'query') {
                    return 'query params may only reference $state';
                }
                return queryIds.has(ref.queryId)
                    ? null
                    : `"${ref.queryId}" is not a declared query`;
            case 'result':
                if (scope.kind === 'query') {
                    return '$result is only allowed in action steps';
                }
                return scope.earlierStepIds.has(ref.stepId)
                    ? null
                    : `"${ref.stepId}" is not an earlier step`;
            case 'item':
                return scope.kind === 'step' && scope.inForEach
                    ? null
                    : '$item is only allowed inside a forEach step';
            default:
                return assertUnreachable(
                    ref,
                    'Unknown generative UI reference',
                );
        }
    };

    const checkRefs = (refs: LocatedRef[], scope: RefScope) =>
        refs.forEach(({ ref, location }) => {
            const problem = refProblem(ref, scope);
            if (problem !== null) report(location, problem);
        });

    const lookupOperation = (
        operationId: string,
        location: string,
        role: 'query' | 'step',
    ): GenerativeUiOperation | null => {
        if (!GENERATIVE_UI_ALLOWED_OPERATION_IDS.has(operationId)) {
            report(
                location,
                `"${operationId}" is not an operation generateUi may call; find one with searchApi`,
            );
            return null;
        }
        const operation = context.operations.get(operationId);
        if (operation === undefined) {
            report(location, `"${operationId}" is not in the API catalog`);
            return null;
        }
        switch (role) {
            case 'query':
                if (operation.method !== 'GET') {
                    report(
                        location,
                        `queries must be GET operations, and "${operationId}" is ${operation.method}; make it an action step`,
                    );
                }
                return operation;
            case 'step':
                if (operation.method === 'GET') {
                    report(
                        location,
                        `steps must not be GET operations; declare "${operationId}" as a query`,
                    );
                }
                return operation;
            default:
                return assertUnreachable(
                    role,
                    'Unknown generative UI request role',
                );
        }
    };

    const checkInjectedParam = (
        params: GenerativeUiParams | undefined,
        location: string,
    ) => {
        if (Object.keys(params?.path ?? {}).includes(INJECTED_PATH_PARAM)) {
            report(
                `${location}.path.${INJECTED_PATH_PARAM}`,
                'projectUuid is filled in from the conversation; remove it',
            );
        }
    };

    const compileParams = (
        operation: GenerativeUiOperation,
        params: GenerativeUiParams | undefined,
        location: string,
    ): GenerativeUiCompiledRequest['params'] => {
        const templateNames = new Set(pathParamNamesOf(operation.pathTemplate));
        const provided = params?.path ?? {};
        Object.entries(provided).forEach(([name, value]) => {
            const paramLocation = `${location}.path.${name}`;
            if (name === INJECTED_PATH_PARAM) return;
            if (!templateNames.has(name)) {
                report(
                    paramLocation,
                    `"${operation.operationId}" has no path parameter "${name}"`,
                );
            } else if (value === null || typeof value === 'boolean') {
                report(
                    paramLocation,
                    'path parameters must be strings, numbers or references',
                );
            }
        });
        const providedNames = new Set(Object.keys(provided));
        templateNames.forEach((name) => {
            if (name !== INJECTED_PATH_PARAM && !providedNames.has(name)) {
                report(
                    `${location}.path`,
                    `missing path parameter "${name}" (${operation.pathTemplate})`,
                );
            }
        });
        const { [INJECTED_PATH_PARAM]: _projectUuid, ...path } = provided;
        return {
            path: templateNames.has(INJECTED_PATH_PARAM)
                ? { ...path, [INJECTED_PATH_PARAM]: context.projectUuid }
                : path,
            query: params?.query ?? {},
            body: params?.body,
        };
    };

    const compiledQueries = Object.entries(spec.queries ?? {}).flatMap(
        ([id, query]) => {
            const location = `queries.${id}`;
            checkInjectedParam(query.params, `${location}.params`);
            checkRefs(paramRefs(query.params, `${location}.params`), {
                kind: 'query',
            });
            const operation = lookupOperation(
                query.operationId,
                `${location}.operationId`,
                'query',
            );
            if (operation === null) return [];
            return [
                {
                    id,
                    operation,
                    params: compileParams(
                        operation,
                        query.params,
                        `${location}.params`,
                    ),
                },
            ];
        },
    );

    const forEachProblem = (
        forEach: GenerativeUiRef,
        earlierStepIds: ReadonlySet<string>,
    ): string | null => {
        const target = parseGenerativeUiRef(forEach);
        if (target === null) return 'is not a reference';
        switch (target.kind) {
            case 'state': {
                const kind = stateKeys.get(target.key);
                if (kind === undefined) {
                    return `"${target.key}" is not the key of an input or table selection`;
                }
                switch (kind) {
                    case 'multiple':
                        return null;
                    case 'single':
                        return `"${target.key}" holds one value; forEach needs a multiSelect or a table with multiple selection`;
                    default:
                        return assertUnreachable(
                            kind,
                            'Unknown generative UI state key kind',
                        );
                }
            }
            case 'query':
                return queryIds.has(target.queryId)
                    ? null
                    : `"${target.queryId}" is not a declared query`;
            case 'result':
                return earlierStepIds.has(target.stepId)
                    ? null
                    : `"${target.stepId}" is not an earlier step`;
            case 'item':
                return 'forEach cannot iterate $item';
            default:
                return assertUnreachable(
                    target,
                    'Unknown generative UI reference',
                );
        }
    };

    const stepIds = new Set<string>();
    const compiledSteps = spec.action.steps.flatMap((step, index) => {
        const location = `action.steps[${index}]`;
        const earlierStepIds = new Set(stepIds);
        if (stepIds.has(step.id)) {
            report(`${location}.id`, `duplicate step id "${step.id}"`);
        }
        stepIds.add(step.id);

        checkInjectedParam(step.params, `${location}.params`);
        const refs = paramRefs(step.params, `${location}.params`);
        checkRefs(refs, {
            kind: 'step',
            earlierStepIds,
            inForEach: step.forEach !== undefined,
        });
        if (step.forEach !== undefined) {
            const problem = forEachProblem(step.forEach, earlierStepIds);
            if (problem !== null) report(`${location}.forEach`, problem);
            if (!refs.some(({ ref }) => ref.kind === 'item')) {
                report(
                    `${location}.params`,
                    'a forEach step must read its element with {"$item": path}',
                );
            }
        }

        const operation = lookupOperation(
            step.operationId,
            `${location}.operationId`,
            'step',
        );
        if (operation === null) return [];
        return [
            {
                step,
                operation,
                params: compileParams(
                    operation,
                    step.params,
                    `${location}.params`,
                ),
            },
        ];
    });

    const deleteStep = compiledSteps.find(
        ({ operation }) => operation.method === 'DELETE',
    );
    if (deleteStep !== undefined && spec.action.confirm === undefined) {
        report(
            'action.confirm',
            `required because step "${deleteStep.step.id}" uses DELETE`,
        );
    }

    if (problems.length > 0) return { ok: false, problems };
    return {
        ok: true,
        compiled: { spec, queries: compiledQueries, steps: compiledSteps },
    };
};
