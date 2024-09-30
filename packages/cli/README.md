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

eg: `ligthdash test` Runs `dbt test`

## Development

First build the package

```shell
yarn cli-build
```

Then run the cli commands with `node` and pointing to the `dist/index.js` file

### Examples from lightdash root folder

Lightdash login

```
node ./packages/cli/dist/index.js login http://localhost:3000
```

Dbt compile

```
dbt compile --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
```

Lightdash generate

```
node ./packages/cli/dist/index.js generate --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
```

Lightdash preview

```
node ./packages/cli/dist/index.js preview --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
```

Lightdash run

```
node ./packages/cli/dist/index.js dbt run --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles -s
```

### Testing different dbt versions

If you want to test different dbt versions, you can replace the string `dbt` in the "execa" calls in the package with `dbt${YOUR_VERSION}`, eg: `dbt1.8`.

If the version you want to test is >= 1.6, and you're using "full-jaffle-shop-demo", you'll also need to delete the file `metrics.yml` in: /examples/full-jaffle-shop-demo/dbt/models/metrics.yml

```

```
