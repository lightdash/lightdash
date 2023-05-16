import { ValidationResponse } from '@lightdash/common';

export const sortAlphabetically = (
    a: ValidationResponse,
    b: ValidationResponse,
) => {
    const nameA = a.name.toUpperCase();
    const nameB = b.name.toUpperCase();

    if (nameA < nameB) {
        return -1;
    } else if (nameA > nameB) {
        return 1;
    } else {
        return 0;
    }
};
