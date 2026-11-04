import { type StackType } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type CartesianTypeOptions } from '../../../hooks/cartesianChartConfig/useCartesianChartConfig';

// What the chart type gallery asks the next cartesian editor to apply.
// Outlives a chart type switch, so it is not part of any editor slice.
export type CartesianIntentState = {
    stacking: boolean | StackType | undefined;
    cartesianType: CartesianTypeOptions | undefined;
};

export const initialCartesianIntent: CartesianIntentState = {
    stacking: undefined,
    cartesianType: undefined,
};

const cartesianIntentSlice = createSlice({
    name: 'cartesianIntent',
    initialState: initialCartesianIntent,
    reducers: {
        setStacking: (
            state,
            action: PayloadAction<boolean | StackType | undefined>,
        ) => {
            state.stacking = action.payload;
        },
        setCartesianType: (
            state,
            action: PayloadAction<CartesianTypeOptions | undefined>,
        ) => {
            state.cartesianType = action.payload;
        },
    },
});

export const cartesianIntentActions = cartesianIntentSlice.actions;
export const cartesianIntentReducer = cartesianIntentSlice.reducer;
