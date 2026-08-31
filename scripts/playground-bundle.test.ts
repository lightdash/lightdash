import * as assert from 'assert';
import { replaceTableMaterializations } from './playground-bundle/projectYaml';

assert.strictEqual(
    replaceTableMaterializations(`models:
  jaffle_shop:
    materialized: table
  another_project:
    materialized: table
`),
    `models:
  jaffle_shop:
    materialized: view
  another_project:
    materialized: view
`,
);

assert.throws(
    () => replaceTableMaterializations('models: {}\n'),
    /must define a table materialization/,
);
