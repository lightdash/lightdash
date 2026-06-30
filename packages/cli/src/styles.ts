import chalk from 'chalk';

export const error = chalk.red;
export const title = chalk.bold.yellowBright;
export const info = (s: string) => s;
// Avoid TS7 RC CJS destructured-export bug; remove after compiler includes the fix.
// https://github.com/microsoft/typescript-go/issues/4403
// eslint-disable-next-line prefer-destructuring
export const bold = chalk.bold;
export const secondary = chalk.dim;
export const success = chalk.bold.green;
export const warning = chalk.yellow;
export const debug = chalk.grey;
