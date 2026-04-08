import {
    type WarehouseTypes,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { compile, parse } from '@lightdash/formula';
import { Text } from '@mantine-8/core';
import type { Editor } from '@tiptap/react';
import {
    useCallback,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    forwardRef,
} from 'react';
import { FormulaEditor } from './FormulaEditor';
import { buildFieldMapping, getFormulaDialect } from './formulaFieldUtils';
import styles from './FormulaForm.module.css';

export type FormulaFormRef = {
    /** Compile the current formula to SQL. Returns the SQL string or throws on error. */
    compileFormula: () => { sql: string; formulaSource: string };
};

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    warehouseType: WarehouseTypes | undefined;
    initialFormulaSource?: string;
    isFullScreen?: boolean;
};

// ts-unused-exports:disable-next-line
export const FormulaForm = forwardRef<FormulaFormRef, Props>(
    (
        {
            explore,
            metricQuery,
            warehouseType,
            initialFormulaSource,
            isFullScreen,
        },
        ref,
    ) => {
        const editorRef = useRef<Editor | null>(null);
        const [parseError, setParseError] = useState<string | null>(null);

        const fieldMapping = useMemo(
            () => buildFieldMapping(explore, metricQuery),
            [explore, metricQuery],
        );

        const dialect = useMemo(
            () => getFormulaDialect(warehouseType),
            [warehouseType],
        );

        const handleTextChange = useCallback((text: string) => {
            if (!text.trim()) {
                setParseError(null);
                return;
            }
            try {
                parse(text);
                setParseError(null);
            } catch (e: unknown) {
                const message =
                    e instanceof Error ? e.message : 'Invalid formula';
                setParseError(message);
            }
        }, []);

        useImperativeHandle(
            ref,
            () => ({
                compileFormula: () => {
                    const editor = editorRef.current;
                    if (!editor) {
                        throw new Error('Editor not initialized');
                    }

                    const formulaText = editor.getText().trim();
                    if (!formulaText) {
                        throw new Error('Formula cannot be empty');
                    }

                    // Build the columns map: fieldId → fieldId
                    // The formula text from getText() contains field IDs (from mention renderText)
                    // The compile() columns map tells the codegen how to quote each column ref
                    const columns: Record<string, string> = {};
                    for (const fieldId of Object.keys(
                        fieldMapping.idToDisplay,
                    )) {
                        columns[fieldId] = fieldId;
                    }

                    const sql = compile(formulaText, {
                        dialect,
                        columns,
                    });

                    // Store the raw formula text (with field IDs) for re-editing
                    // On re-edit, this is loaded as plain text into the editor
                    return { sql, formulaSource: formulaText };
                },
            }),
            [dialect, fieldMapping],
        );

        return (
            <>
                <FormulaEditor
                    explore={explore}
                    metricQuery={metricQuery}
                    initialContent={initialFormulaSource}
                    onTextChange={handleTextChange}
                    editorRef={editorRef}
                    isFullScreen={isFullScreen}
                />
                {parseError && (
                    <Text className={styles.errorText}>{parseError}</Text>
                )}
            </>
        );
    },
);

FormulaForm.displayName = 'FormulaForm';
