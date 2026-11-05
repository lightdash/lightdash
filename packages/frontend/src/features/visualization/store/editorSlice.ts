import {
    type ItemsMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { createAction, type PayloadAction } from '@reduxjs/toolkit';

/** What the provider knows when it seeds a chart type's editor */
export type EditorSeedContext = {
    itemsMap: ItemsMap | undefined;
    hasConfigOwner: boolean;
};

export type EditorFieldUpdate<S> = {
    [K in keyof S]: { key: K; value: S[K] };
}[keyof S];

/** Case reducers shared by every chart type's editor slice */
export const editorCaseReducers = <S extends object>() => ({
    set: (state: S, action: PayloadAction<EditorFieldUpdate<S>>) => {
        Object.assign(state, { [action.payload.key]: action.payload.value });
    },
});

/** The explorer renamed table calculations; each editor rewrites the field ids it stores */
export const tableCalculationsRenamed = createAction<
    TableCalculationMetadata[]
>('visualization/tableCalculationsRenamed');

export const renamedFieldId = (
    fieldId: string,
    renames: TableCalculationMetadata[],
) => renames.find((rename) => rename.oldName === fieldId)?.name ?? fieldId;
