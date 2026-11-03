/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-param-reassign */

const isObject = (value: unknown): value is object =>
    typeof value === 'object' && value !== null;

export const mergeExisting = (left: any, right: any) => {
    Object.keys(left).forEach((key) => {
        if (!(key in right)) return;
        left[key] =
            isObject(left[key]) && isObject(right[key])
                ? mergeExisting(left[key], right[key])
                : right[key];
    });
    return left;
};
