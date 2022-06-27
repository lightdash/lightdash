## Lightdash CLI 

Lightash CLI tool

## How to install 

`npm i -g @lightdash/cli`

## Usage 

```
Usage: lightdash [options] [command]

Options:
  -h, --help      display help for command

Commands:
  version         output the version number
  [dbt_command]   runs dbt
  help [command]  display help for command
```

eg: `ligthdash test`  Runs `dbt test`

## Development

First build the package
```shell
yarn cli-build
```

Then run the cli commands with `node` and pointing to the `dist/index.js` file

Examples from lightdash root folder:
```
node ./packages/cli/dist/index.js login http://localhost:3000 
dbt compile --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
node ./packages/cli/dist/index.js generate --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
node ./packages/cli/dist/index.js preview --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
```
