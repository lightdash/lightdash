#!/usr/bin/env node

const { program } = require('commander')
const { exec } = require('child_process');


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
    exec(`npm view lightdash-cli version`, (err: string, stdout: string, stderr: string) => {
        console.log(`lightdash-cli version: ${stdout}`)
    })
}
program.parse()