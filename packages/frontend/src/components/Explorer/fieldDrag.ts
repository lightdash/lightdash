import {
    useCallback,
    useRef,
    useState,
    type DragEvent,
    type HTMLAttributes,
} from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../features/explorer/store';

// Native drag and drop: the field tree and the cards share no React parent
// below the page, and the browser carries the payload between them.
const FIELD_DRAG_TYPE = 'application/x-explore-field';

export type DraggedField = { fieldId: string; isDimension: boolean };

export type FieldDropProps = Pick<
    HTMLAttributes<HTMLDivElement>,
    'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop'
>;

export const startFieldDrag = (event: DragEvent, field: DraggedField) => {
    event.dataTransfer.setData(FIELD_DRAG_TYPE, JSON.stringify(field));
    event.dataTransfer.effectAllowed = 'copy';
};

const readDraggedField = (event: DragEvent): DraggedField | null => {
    try {
        const parsed: unknown = JSON.parse(
            event.dataTransfer.getData(FIELD_DRAG_TYPE),
        );
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'fieldId' in parsed &&
            typeof parsed.fieldId === 'string' &&
            'isDimension' in parsed &&
            typeof parsed.isDimension === 'boolean'
        ) {
            return { fieldId: parsed.fieldId, isDimension: parsed.isDimension };
        }
        return null;
    } catch {
        return null;
    }
};

const isFieldDrag = (event: DragEvent) =>
    event.dataTransfer.types.includes(FIELD_DRAG_TYPE);

/** Makes an element accept a field dragged from the tree. */
export const useFieldDrop = (onDropField: (field: DraggedField) => void) => {
    const [isOver, setIsOver] = useState(false);
    // Enter and leave fire for every child, so only the outermost pair counts
    const depth = useRef(0);

    const dropProps: FieldDropProps = {
        onDragEnter: (event) => {
            if (!isFieldDrag(event)) return;
            depth.current += 1;
            setIsOver(true);
        },
        onDragOver: (event) => {
            if (!isFieldDrag(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: (event) => {
            if (!isFieldDrag(event)) return;
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setIsOver(false);
        },
        onDrop: (event) => {
            depth.current = 0;
            setIsOver(false);
            const field = readDraggedField(event);
            if (!field) return;
            event.preventDefault();
            onDropField(field);
        },
    };

    return { isOver, dropProps };
};

/** Puts a dropped field on the query (if it is not there yet) and runs it. */
export const useAddDroppedFieldToQuery = () => {
    const dispatch = useExplorerDispatch();
    return useCallback(
        ({ fieldId, isDimension }: DraggedField) =>
            dispatch(
                isDimension
                    ? explorerActions.addDimensionToQuery(fieldId)
                    : explorerActions.addMetricToQuery(fieldId),
            ),
        [dispatch],
    );
};
