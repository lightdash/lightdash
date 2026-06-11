export const getUserAttributeRegex = () =>
    /\$\{(?:lightdash|ld)\.(?:attribute|attributes|attr)\.(\w+)\}/g;
export const getIntrinsicUserAttributeRegex = () =>
    /\$\{(?:lightdash|ld)\.user\.(\w+)\}/g;

export const hasLightdashUserContextVariableReference = (
    sql: string,
): boolean =>
    sql.match(getUserAttributeRegex()) !== null ||
    sql.match(getIntrinsicUserAttributeRegex()) !== null;
