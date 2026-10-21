const path = require('node:path');
require('./local-telemetry.cjs');
const work = process.env.EXPLORATORY_WORK_DIR || path.join(__dirname, '.work');
require('node:os').homedir = () => path.join(work, 'cli-home');
