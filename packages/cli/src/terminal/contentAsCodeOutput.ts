import chalk from 'chalk';
import GlobalState from '../globalState';

export type ContentAsCodeOutputVariant = 'success' | 'warning';

export type ContentAsCodeOutputItem = {
    label: string;
    detail: string;
    durationMs: number;
    variant?: ContentAsCodeOutputVariant;
};

export type ContentAsCodeOutputProps = {
    operation: 'download' | 'upload';
    scope: 'organization' | 'project';
    path: string;
    elapsedSeconds: number;
    items: ContentAsCodeOutputItem[];
};

type ContentAsCodeProgressProps = Pick<
    ContentAsCodeOutputProps,
    'operation' | 'scope' | 'items'
> & {
    activeLabel: string;
};

type ContentAsCodeFailureProps = Pick<
    ContentAsCodeOutputProps,
    'operation' | 'scope' | 'elapsedSeconds' | 'items'
> & {
    failedItem: Omit<ContentAsCodeOutputItem, 'variant'>;
};

const ACTION_LABEL_WIDTH = 14;
const TREE_CONNECTOR = chalk.gray('└');

const getDurationLabel = (durationMs: number) =>
    `(${Math.round(durationMs)}ms)`;

const getOperationLabel = (
    operation: ContentAsCodeOutputProps['operation'],
    tense: 'running' | 'complete',
) => {
    if (operation === 'download') {
        return tense === 'running' ? 'Downloading' : 'Downloaded';
    }
    return tense === 'running' ? 'Uploading' : 'Uploaded';
};

export const formatDurationTag = (durationMs: number) =>
    chalk.gray(getDurationLabel(durationMs));

export const formatContentAsCodeAction = ({
    label,
    detail,
    durationMs,
}: Pick<ContentAsCodeOutputItem, 'label' | 'detail' | 'durationMs'>) =>
    `${chalk.bold(label.padEnd(ACTION_LABEL_WIDTH))} ${chalk.gray(
        detail,
    )} ${formatDurationTag(durationMs)}`;

const formatTreeItem = ({
    label,
    detail,
    durationMs,
    variant = 'success',
}: ContentAsCodeOutputItem) => {
    const status = variant === 'success' ? chalk.green('✓') : chalk.yellow('⚠');
    return `  ${TREE_CONNECTOR} ${status} ${chalk.bold(label)} ${chalk.gray(
        `· ${detail}`,
    )} ${formatDurationTag(durationMs)}`;
};

export const formatContentAsCodeProgress = ({
    operation,
    scope,
    items,
    activeLabel,
}: ContentAsCodeProgressProps) => {
    const header = `${chalk.bold(
        getOperationLabel(operation, 'running'),
    )} content as code ${chalk.gray(`(${scope})`)}`;
    const completedItems = items.map(formatTreeItem);
    const activeItem = `  ${TREE_CONNECTOR} ${chalk.yellow('◐')} ${chalk.bold(
        activeLabel,
    )} ${chalk.gray(`· ${getOperationLabel(operation, 'running').toLowerCase()}…`)}`;

    return [header, ...completedItems, activeItem].join('\n');
};

export const formatContentAsCodeFailure = ({
    operation,
    scope,
    elapsedSeconds,
    items,
    failedItem,
}: ContentAsCodeFailureProps) => {
    const operationLabel = operation === 'download' ? 'download' : 'upload';
    const header = `${chalk.bold(
        `Failed to ${operationLabel}`,
    )} content as code ${chalk.gray(`(${scope}) · ${elapsedSeconds.toFixed(1)}s`)}`;
    const failed = `  ${TREE_CONNECTOR} ${chalk.red('×')} ${chalk.bold(
        failedItem.label,
    )} ${chalk.red(`· ${failedItem.detail}`)} ${chalk.red(
        getDurationLabel(failedItem.durationMs),
    )}`;

    return [header, ...items.map(formatTreeItem), failed].join('\n');
};

export const formatContentAsCodeComplete = ({
    operation,
    scope,
    path,
    elapsedSeconds,
    items,
}: ContentAsCodeOutputProps) => {
    const operationLabel = getOperationLabel(operation, 'complete');
    const pathLabel = operation === 'download' ? 'Saved to' : 'Read from';
    const header = `${chalk.green('✓')} ${chalk.bold(
        operationLabel,
    )} content as code ${chalk.gray(`(${scope}) · ${elapsedSeconds.toFixed(1)}s`)}`;
    const pathItem = `  ${TREE_CONNECTOR} ${chalk.gray(pathLabel)} ${chalk.bold(
        path,
    )}`;

    return [header, ...items.map(formatTreeItem), pathItem].join('\n');
};

export const canRenderContentAsCodeTree = (): boolean =>
    Boolean(
        process.stderr.isTTY &&
        process.env.CI !== 'true' &&
        process.env.TERM !== 'dumb' &&
        process.env.NO_UNICODE !== '1' &&
        process.env.NO_UNICODE !== 'true',
    );

export const renderContentAsCodeComplete = (
    props: ContentAsCodeOutputProps,
): boolean => {
    if (!canRenderContentAsCodeTree()) {
        return false;
    }

    process.stderr.write(`${formatContentAsCodeComplete(props)}\n`);
    return true;
};

type CreateContentAsCodeOutputProps = Pick<
    ContentAsCodeOutputProps,
    'operation' | 'scope'
> & {
    initialLabel: string;
};

export const createContentAsCodeOutput = ({
    operation,
    scope,
    initialLabel,
}: CreateContentAsCodeOutputProps) => {
    const useTree = canRenderContentAsCodeTree();
    const items: ContentAsCodeOutputItem[] = [];
    let activeLabel = initialLabel;
    let activeStartedAt = Date.now();
    const runningLabel = getOperationLabel(operation, 'running');
    const spinner = GlobalState.startSpinner(
        useTree
            ? formatContentAsCodeProgress({
                  operation,
                  scope,
                  items,
                  activeLabel,
              })
            : `${runningLabel} ${activeLabel.toLowerCase()}`,
    );

    const setActive = (label: string) => {
        activeLabel = label;
        activeStartedAt = Date.now();
        if (useTree) {
            spinner.text = formatContentAsCodeProgress({
                operation,
                scope,
                items,
                activeLabel,
            });
        } else {
            spinner.start(`${runningLabel} ${activeLabel.toLowerCase()}`);
        }
    };

    return {
        completeItem: (
            item: ContentAsCodeOutputItem,
            nextLabel: string | null,
        ) => {
            items.push(item);
            if (!useTree) {
                if (item.variant === 'warning') {
                    spinner.stop();
                } else {
                    spinner.succeed(formatContentAsCodeAction(item));
                }
            }
            if (nextLabel !== null) {
                setActive(nextLabel);
            }
        },
        prepareForFailureDetails: () => {
            if (!useTree) {
                spinner.stop();
            }
        },
        complete: (path: string, elapsedSeconds: number): boolean => {
            if (!useTree) {
                return false;
            }
            spinner.stop();
            return renderContentAsCodeComplete({
                operation,
                scope,
                path,
                elapsedSeconds,
                items,
            });
        },
        fail: (
            detail: string,
            elapsedSeconds: number,
            showFallback: boolean,
        ) => {
            if (useTree) {
                spinner.fail(
                    formatContentAsCodeFailure({
                        operation,
                        scope,
                        elapsedSeconds,
                        items,
                        failedItem: {
                            label: activeLabel,
                            detail,
                            durationMs: Date.now() - activeStartedAt,
                        },
                    }),
                );
            } else if (showFallback) {
                spinner.fail(
                    `Failed to ${operation} ${scope} content: ${detail}`,
                );
            }
        },
    };
};
