const os = require('node:os');
const path = require('node:path');
os.homedir = () => path.join(__dirname,'cli-home');
require('node:module').syncBuiltinESMExports();
