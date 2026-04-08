import {
    type WarehouseTypes,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { compile, parse } from '@lightdash/formula';
import { Code, Text } from '@mantine-8/core';
import type { Editor } from '@tiptap/react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { FormulaEditor } from './FormulaEditor';
import { buildFieldMapping, getFormulaDialect } from './formulaFieldUtils';
import styles from './FormulaForm.module.css';

/** Prepend '=' for the parser — strip if user typed it since the UI shows '=' as a prefix */
function toFormulaText(text: string): string {
    const trimmed = text.trim();
    return trimmed.startsWith('=') ? trimmed : `=${trimmed}`;
}

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    warehouseType: WarehouseTypes | undefined;
    initialFormulaSource?: string;
    isFullScreen?: boolean;
};

// ts-unused-exports:disable-next-line
export const FormulaForm: FC<Props> = ({
    explore,
    metricQuery,
    warehouseType,
    initialFormulaSource,
    isFullScreen,
}) => {
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

    /** Client-side compile for preview only — real compilation will happen on the backend */
    const tryCompile = useCallback(
        (text: string): string | null => {
            const columns: Record<string, string> = {};
            for (const fieldId of Object.keys(fieldMapping.idToDisplay)) {
                columns[fieldId] = fieldId;
            }
            try {
                return compile(toFormulaText(text), { dialect, columns });
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
                parse(toFormulaText(text));
                setParseError(null);
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

    return (
        <>
            <FormulaEditor
                explore={explore}
                metricQuery={metricQuery}
                initialContent={initialFormulaSource?.replace(/^=/, '')}
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
};
