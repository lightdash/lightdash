// This script will be executed after npm install

const title = '\x1B[93m';
const clear = '\x1B[0m'; 
const success = '\x1B[32m';
const bold = '\x1B[1m';

console.error(`
${title}⚡lightdash${clear} CLI installed ${success}successfully${clear}

Run ${bold}lightdash --help${clear} to get a detailed list of all commands
`)

process.exit(1);