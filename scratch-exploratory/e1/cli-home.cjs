const path = require('node:path');
const work = process.env.EXPLORATORY_WORK_DIR || path.join(__dirname, '.work');
require('node:os').homedir = () => path.join(work, 'cli-home');
