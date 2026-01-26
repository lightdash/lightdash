# Warning about seed order

**This only works because knex orders the seed directories alphabetically and `ee` is after `database`.**

Otherwise we would be blocked because of 2 reasons:

-   There is a bug in Knex that order seed folders alphabetically rather than keeping the array order.
-   We should also be able to use the `specific` option in the `knexfile.js` to specify the order of the seeds from
    different folders. But there is a [bug preventing from passing an array](https://github.com/knex/knex/issues?q=is%3Aissue+is%3Aopen+seed+specific).
