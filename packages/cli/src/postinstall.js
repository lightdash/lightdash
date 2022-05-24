// This script will be executed after npm install

const chalk = require('chalk')

const title = chalk.bold.yellowBright;
const success = chalk.green;
const { bold } = chalk;

console.log(`
${title('⚡lightdash')} CLI installed ${success('successfully')}

Run ${bold('lightdash --help')} to get a detailed list of all commands
`)