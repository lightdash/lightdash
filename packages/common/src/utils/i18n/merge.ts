/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import isObject from 'lodash/isObject';
import transform from 'lodash/transform';

export const mergeExisting = (left: any, right: any) =>
    transform(
        left,
        (acc, value, key) => {
            if (key in right) {
                if (isObject(value) && isObject(right[key])) {
                    acc[key] = mergeExisting(value, right[key]);
                } else {
                    acc[key] = right[key];
                }
            } else {
                acc[key] = value;
            }
        },
        left,
    );
