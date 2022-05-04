#!/usr/bin/env node

const { program } = require('commander')
const { exec } = require('child_process');
const { version: VERSION } = require('../package.json');


program
    .command('version')
    .description('output the version number')
    .action(version)
program
    .command('[dbt_command]', { isDefault: true })
    .description('runs dbt')
    .action(dbt)



function dbt () {

    const args = process.argv.slice(2).join(' ')

    exec(`dbt ${args}`, (err: string, stdout: string, stderr: string) => {
        console.log(`${stdout}`);
        console.error(`${stderr}`);
      });
}

function version () {
     console.log(`lightdash-cli version: ${VERSION}`)
}
program.parse()