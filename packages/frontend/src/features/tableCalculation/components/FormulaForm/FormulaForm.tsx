import { type Explore, type MetricQuery } from '@lightdash/common';
import type { Editor } from '@tiptap/react';
import { useRef, type FC } from 'react';
import { FormulaEditor } from './FormulaEditor';

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    isFullScreen?: boolean;
};

export const FormulaForm: FC<Props> = ({
    explore,
    metricQuery,
    isFullScreen,
}) => {
    const editorRef = useRef<Editor | null>(null);

    // TODO: call backend parse/compile endpoints for validation and SQL preview
    return (
        <FormulaEditor
            explore={explore}
            metricQuery={metricQuery}
            editorRef={editorRef}
            isFullScreen={isFullScreen}
        />
    );
};
