const cp = require('node:child_process');
const path = require('node:path');
for (const name of ['spawn','spawnSync']) {
 const original = cp[name];
 cp[name] = function(command,args,options) {
  if (typeof command === 'string' && /(^|\/)git$/.test(command)) {
   options = {...options,env:{...(options?.env || process.env),GIT_CONFIG_SYSTEM:path.join(__dirname,'gitconfig')}};
  }
  return original.call(this,command,args,options);
 };
}
require('node:module').syncBuiltinESMExports();
