import {
    type WarehouseTypes,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { compile, parse } from '@lightdash/formula';
import { Code, Text } from '@mantine-8/core';
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
    /** Compile the current formula to SQL. Returns formula + compiledSql for the new type variant. */
    compileFormula: () => { formula: string; compiledSql: string };
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
        const [sqlPreview, setSqlPreview] = useState<string | null>(null);

        const fieldMapping = useMemo(
            () => buildFieldMapping(explore, metricQuery),
            [explore, metricQuery],
        );

        const dialect = useMemo(
            () => getFormulaDialect(warehouseType),
            [warehouseType],
        );

        const tryCompile = useCallback(
            (text: string): string | null => {
                const columns: Record<string, string> = {};
                for (const fieldId of Object.keys(fieldMapping.idToDisplay)) {
                    columns[fieldId] = fieldId;
                }
                try {
                    return compile(text, { dialect, columns });
                } catch {
                    return null;
                }
            },
            [dialect, fieldMapping],
        );

        const handleTextChange = useCallback(
            (text: string) => {
                if (!text.trim()) {
                    setParseError(null);
                    setSqlPreview(null);
                    return;
                }
                try {
                    parse(text);
                    setParseError(null);
                    // If parse succeeds, try to compile for preview
                    const sql = tryCompile(text);
                    setSqlPreview(sql);
                } catch (e: unknown) {
                    const message =
                        e instanceof Error ? e.message : 'Invalid formula';
                    setParseError(message);
                    setSqlPreview(null);
                }
            },
            [tryCompile],
        );

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

                    const columns: Record<string, string> = {};
                    for (const fieldId of Object.keys(
                        fieldMapping.idToDisplay,
                    )) {
                        columns[fieldId] = fieldId;
                    }

                    const compiledSql = compile(formulaText, {
                        dialect,
                        columns,
                    });

                    return { formula: formulaText, compiledSql };
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
                {sqlPreview && !parseError && (
                    <Code block className={styles.sqlPreview}>
                        {sqlPreview}
                    </Code>
                )}
            </>
        );
    },
);

FormulaForm.displayName = 'FormulaForm';
