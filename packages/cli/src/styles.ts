import chalk from 'chalk';

export const error = chalk.red;
export const title = chalk.bold.yellowBright;
export const info = (s: string) => s;
export const { bold } = chalk;
export const secondary = chalk.dim;
export const success = chalk.bold.green;
export const warning = chalk.yellow;
export const debug = chalk.grey;
