import { type ItemsMap } from '@lightdash/common';
import { Text, Tooltip } from '@mantine-8/core';
import { IconArrowUp } from '@tabler/icons-react';
import { useMemo, useRef, useState, type FC } from 'react';
import { ComposerSubmitButton } from '../../../components/common/PromptComposer/ComposerSubmitButton';
import PromptComposer, {
    type PromptComposerHandle,
} from '../../../components/common/PromptComposer/PromptComposer';
import {
    getVizPromptColumns,
    type VizPromptColumn,
} from '../utils/buildVizGenerationPrompt';
import classes from './DataAppVizComposer.module.css';

type Props = {
    itemsMap: ItemsMap;
    placeholder: string;
    /** True while a build is running: keep typing, block sending. */
    isBuilding: boolean;
    onSubmit: (description: string, columns: VizPromptColumn[]) => void;
};

/**
 * Describe-a-visualization input for the chart config panel.
 *
 * The query's columns ride along as chips so the author can see what the
 * builder is being told, and exclude any column that shouldn't shape the
 * result. Column names and types are sent; result rows are not.
 */
const DataAppVizComposer: FC<Props> = ({
    itemsMap,
    placeholder,
    isBuilding,
    onSubmit,
}) => {
    const composerRef = useRef<PromptComposerHandle>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    // Excluded rather than included, so columns added to the query later are
    // carried along by default instead of being silently dropped.
    const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(
        new Set(),
    );

    const columns = useMemo(() => getVizPromptColumns(itemsMap), [itemsMap]);
    const includedColumns = columns.filter((c) => !excludedIds.has(c.id));

    const toggle = (id: string) =>
        setExcludedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const handleSubmit = () => {
        const description = composerRef.current?.getText().trim() ?? '';
        if (!description || isBuilding) return;
        composerRef.current?.clear();
        onSubmit(description, includedColumns);
    };

    return (
        <PromptComposer
            ref={composerRef}
            size="md"
            placeholder={placeholder}
            submitDisabled={isBuilding}
            onEmptyChange={setIsEmpty}
            onSubmit={handleSubmit}
            attachments={
                columns.length > 0 ? (
                    <div className={classes.columnList}>
                        {columns.map((column) => {
                            const included = !excludedIds.has(column.id);
                            return (
                                <Tooltip
                                    key={column.id}
                                    withArrow
                                    label={
                                        included
                                            ? 'Exclude from this request'
                                            : 'Include in this request'
                                    }
                                >
                                    <button
                                        type="button"
                                        aria-pressed={included}
                                        onClick={() => toggle(column.id)}
                                        className={`${classes.columnChip} ${
                                            included
                                                ? classes.columnChipIncluded
                                                : ''
                                        }`}
                                    >
                                        {column.label}
                                    </button>
                                </Tooltip>
                            );
                        })}
                    </div>
                ) : (
                    <Text size="xs" c="dimmed" px="xs" pb="xs">
                        Run a query first so the builder knows your columns.
                    </Text>
                )
            }
            toolbarRight={
                <ComposerSubmitButton
                    icon={IconArrowUp}
                    label="Send"
                    size="sm"
                    disabled={isEmpty || isBuilding}
                    loading={isBuilding}
                    onClick={handleSubmit}
                />
            }
        />
    );
};

export default DataAppVizComposer;
