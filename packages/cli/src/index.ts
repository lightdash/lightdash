#! /usr/bin/env node

const { program } = require('commander')
const { exec } = require('child_process');

program
    .command('*')
    .description('Runs dbt')
    .action(dbt)


function dbt () {

    if(process.argv.length  <= 2){
        console.log(program.help());
        return 
    }
    const args = process.argv.slice(2).join(' ')

    exec(`dbt ${args}`, (err: string, stdout: string, stderr: string ) => {
        console.log(`${stdout}`);
        console.error(`${stderr}`);
      });
}

program.parse()