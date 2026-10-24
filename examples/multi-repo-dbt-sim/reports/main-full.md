Baseline revision: `b7dd419f984c6eb707635bc40bc784c81f06c614`. Scale: `full`. Seed: `42`.

| Scenario   | Mode   | Before → after | Last operation | Passes | Parameters / tags / groups |
| ---------- | ------ | -------------- | -------------- | ------ | -------------------------- |
| baseline   | server | 0 → 3000       | success        | 1      | 1/1/2                      |
| scale      | server | 0 → 3000       | success        | 1      | 1/1/2                      |
| versioned  | server | 3000 → 3000    | success        | 1      | 1/1/2                      |
| unreadable | server | 3000 → 3000    | failure        | None   | 1/1/2                      |
| collision  | server | 2900 → 3001    | success        | 1      | 1/1/2                      |
| cli-deploy | cli    | 1300 → 25      | success        | None   | 0/0/1                      |

<details><summary>baseline</summary>

Ring, shared upstream, mixed refs and joins compile

Connection mode: `single`. API route: `single`.

| Source        | Before | After |
| ------------- | ------ | ----- |
| accounts      | 0      | 25    |
| billing       | 0      | 25    |
| catalog       | 0      | 25    |
| compliance    | 0      | 25    |
| contracts     | 0      | 25    |
| dbt_project   | 0      | 1300  |
| delivery      | 0      | 25    |
| finance       | 0      | 100   |
| fulfilment    | 0      | 25    |
| growth        | 0      | 100   |
| inventory     | 0      | 25    |
| loyalty       | 0      | 25    |
| marketing     | 0      | 100   |
| merchants     | 0      | 900   |
| pricing       | 0      | 25    |
| products      | 0      | 25    |
| regions       | 0      | 25    |
| retention     | 0      | 25    |
| risk          | 0      | 100   |
| subscriptions | 0      | 25    |
| support       | 0      | 25    |
| treasury      | 0      | 25    |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 91185 | 1      | 43                     | False    | False               |

Project config after:

```json
{
    "parameters": {
        "minimum_amount": {
            "type": "number",
            "label": "Minimum amount",
            "default": 0,
            "allow_custom_values": true
        }
    },
    "spotlight_tags": [
        {
            "tagUuid": "<id>",
            "projectUuid": "<id>",
            "name": "Payments",
            "color": "blue",
            "createdAt": "2026-10-21T16:24:20.003Z",
            "yamlReference": "payments",
            "createdBy": {
                "userUuid": "<id>",
                "firstName": "David",
                "lastName": "Attenborough"
            }
        }
    ],
    "table_groups": {
        "commerce": {
            "label": "Commerce"
        },
        "operations": {
            "label": "Operations"
        }
    },
    "defaults": {
        "column_totals": true,
        "case_sensitive": false
    }
}
```

Warehouse probe resolves: `True`. Rows: `3`.

</details>

<details><summary>scale</summary>

Many sources compile; record Git discovery count and timing

Connection mode: `single`. API route: `single`.

| Source        | Before | After |
| ------------- | ------ | ----- |
| accounts      | 0      | 25    |
| billing       | 0      | 25    |
| catalog       | 0      | 25    |
| compliance    | 0      | 25    |
| contracts     | 0      | 25    |
| dbt_project   | 0      | 1300  |
| delivery      | 0      | 25    |
| finance       | 0      | 100   |
| fulfilment    | 0      | 25    |
| growth        | 0      | 100   |
| inventory     | 0      | 25    |
| loyalty       | 0      | 25    |
| marketing     | 0      | 100   |
| merchants     | 0      | 900   |
| pricing       | 0      | 25    |
| products      | 0      | 25    |
| regions       | 0      | 25    |
| retention     | 0      | 25    |
| risk          | 0      | 100   |
| subscriptions | 0      | 25    |
| support       | 0      | 25    |
| treasury      | 0      | 25    |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 89664 | 1      | 43                     | False    | False               |

Project config after:

```json
{
    "parameters": {
        "minimum_amount": {
            "type": "number",
            "label": "Minimum amount",
            "default": 0,
            "allow_custom_values": true
        }
    },
    "spotlight_tags": [
        {
            "tagUuid": "<id>",
            "projectUuid": "<id>",
            "name": "Payments",
            "color": "blue",
            "createdAt": "2026-10-21T16:24:20.003Z",
            "yamlReference": "payments",
            "createdBy": {
                "userUuid": "<id>",
                "firstName": "David",
                "lastName": "Attenborough"
            }
        }
    ],
    "table_groups": {
        "commerce": {
            "label": "Commerce"
        },
        "operations": {
            "label": "Operations"
        }
    },
    "defaults": {
        "column_totals": true,
        "case_sensitive": false
    }
}
```

</details>

<details><summary>versioned</summary>

Pinned/latest refs may require an extra cold parse

Connection mode: `single`. API route: `single`.

| Source        | Before | After |
| ------------- | ------ | ----- |
| accounts      | 25     | 25    |
| billing       | 25     | 25    |
| catalog       | 25     | 25    |
| compliance    | 25     | 25    |
| contracts     | 25     | 25    |
| dbt_project   | 1300   | 1300  |
| delivery      | 25     | 25    |
| finance       | 100    | 100   |
| fulfilment    | 25     | 25    |
| growth        | 100    | 100   |
| inventory     | 25     | 25    |
| loyalty       | 25     | 25    |
| marketing     | 100    | 100   |
| merchants     | 900    | 900   |
| pricing       | 25     | 25    |
| products      | 25     | 25    |
| regions       | 25     | 25    |
| retention     | 25     | 25    |
| risk          | 100    | 100   |
| subscriptions | 25     | 25    |
| support       | 25     | 25    |
| treasury      | 25     | 25    |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 91434 | 1      | 43                     | False    | False               |
| refresh   | True    | 82738 | 1      | 43                     | False    | False               |

Project config after:

```json
{
    "parameters": {
        "minimum_amount": {
            "type": "number",
            "label": "Minimum amount",
            "default": 0,
            "allow_custom_values": true
        }
    },
    "spotlight_tags": [
        {
            "tagUuid": "<id>",
            "projectUuid": "<id>",
            "name": "Payments",
            "color": "blue",
            "createdAt": "2026-10-21T16:24:20.003Z",
            "yamlReference": "payments",
            "createdBy": {
                "userUuid": "<id>",
                "firstName": "David",
                "lastName": "Attenborough"
            }
        }
    ],
    "table_groups": {
        "commerce": {
            "label": "Commerce"
        },
        "operations": {
            "label": "Operations"
        }
    },
    "defaults": {
        "column_totals": true,
        "case_sensitive": false
    }
}
```

</details>

<details><summary>unreadable</summary>

Refresh fails as a whole; pending isolation work keeps last-good explores

Connection mode: `single`. API route: `single`.

| Source        | Before | After |
| ------------- | ------ | ----- |
| accounts      | 25     | 25    |
| billing       | 25     | 25    |
| catalog       | 25     | 25    |
| compliance    | 25     | 25    |
| contracts     | 25     | 25    |
| dbt_project   | 1300   | 1300  |
| delivery      | 25     | 25    |
| finance       | 100    | 100   |
| fulfilment    | 25     | 25    |
| growth        | 100    | 100   |
| inventory     | 25     | 25    |
| loyalty       | 25     | 25    |
| marketing     | 100    | 100   |
| merchants     | 900    | 900   |
| pricing       | 25     | 25    |
| products      | 25     | 25    |
| regions       | 25     | 25    |
| retention     | 25     | 25    |
| risk          | 100    | 100   |
| subscriptions | 25     | 25    |
| support       | 25     | 25    |
| treasury      | 25     | 25    |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 91570 | 1      | 43                     | False    | False               |
| refresh   | False   | 6103  | None   | 6                      | False    | False               |

Project config after:

```json
{
    "parameters": {
        "minimum_amount": {
            "type": "number",
            "label": "Minimum amount",
            "default": 0,
            "allow_custom_values": true
        }
    },
    "spotlight_tags": [
        {
            "tagUuid": "<id>",
            "projectUuid": "<id>",
            "name": "Payments",
            "color": "blue",
            "createdAt": "2026-10-21T16:24:20.003Z",
            "yamlReference": "payments",
            "createdBy": {
                "userUuid": "<id>",
                "firstName": "David",
                "lastName": "Attenborough"
            }
        }
    ],
    "table_groups": {
        "commerce": {
            "label": "Commerce"
        },
        "operations": {
            "label": "Operations"
        }
    },
    "defaults": {
        "column_totals": true,
        "case_sensitive": false
    }
}
```

healthy_addition_visible: `False`.

Errors and guidance:

```text
Failed to load dbt source "marketing" (sim/marketing): Unexpected error while cloning git repository: Command failed with exit code 128: git clone --single-branch --depth=1 --branch=main --no-tags --progress https://localhost:35103/sim/marketing.git /tmp/git_MTijd5
Cloning into '/tmp/git_MTijd5'...
fatal: unable to access 'https://localhost:35103/sim/marketing.git/': The requested URL returned error: 403
```

</details>

<details><summary>collision</summary>

Newcomer renames both explores; pending naming work preserves original

Connection mode: `single`. API route: `single`.

| Source        | Before | After |
| ------------- | ------ | ----- |
| accounts      | 25     | 25    |
| billing       | 25     | 25    |
| catalog       | 25     | 25    |
| compliance    | 25     | 25    |
| contracts     | 25     | 25    |
| dbt_project   | 1300   | 1300  |
| delivery      | 25     | 25    |
| finance       | 100    | 100   |
| fulfilment    | 25     | 25    |
| growth        | 100    | 100   |
| inventory     | 25     | 25    |
| loyalty       | 25     | 25    |
| marketing     | 0      | 101   |
| merchants     | 900    | 900   |
| pricing       | 25     | 25    |
| products      | 25     | 25    |
| regions       | 25     | 25    |
| retention     | 25     | 25    |
| risk          | 100    | 100   |
| subscriptions | 25     | 25    |
| support       | 25     | 25    |
| treasury      | 25     | 25    |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 88744 | 1      | 41                     | False    | False               |
| refresh   | True    | 85204 | 1      | 43                     | False    | False               |

Project config after:

```json
{
    "parameters": {
        "minimum_amount": {
            "type": "number",
            "label": "Minimum amount",
            "default": 0,
            "allow_custom_values": true
        }
    },
    "spotlight_tags": [
        {
            "tagUuid": "<id>",
            "projectUuid": "<id>",
            "name": "Payments",
            "color": "blue",
            "createdAt": "2026-10-21T16:24:20.003Z",
            "yamlReference": "payments",
            "createdBy": {
                "userUuid": "<id>",
                "firstName": "David",
                "lastName": "Attenborough"
            }
        }
    ],
    "table_groups": {
        "commerce": {
            "label": "Commerce"
        },
        "operations": {
            "label": "Operations"
        }
    },
    "defaults": {
        "column_totals": true,
        "case_sensitive": false
    }
}
```

original_source_preserved: `False`.
Original chart created: `True`. Original query resolves before/after: `True` / `False`.

</details>

<details><summary>cli-deploy</summary>

Sequential full deploys can erase sibling explores before reworked #31326

Connection mode: `single`. API route: `single`.

| Source        | Before | After |
| ------------- | ------ | ----- |
| accounts      | 0      | 0     |
| billing       | 0      | 0     |
| catalog       | 0      | 0     |
| compliance    | 0      | 0     |
| contracts     | 0      | 0     |
| dbt_project   | 1300   | 0     |
| delivery      | 0      | 0     |
| finance       | 0      | 0     |
| fulfilment    | 0      | 0     |
| growth        | 0      | 0     |
| inventory     | 0      | 0     |
| loyalty       | 0      | 0     |
| marketing     | 0      | 0     |
| merchants     | 0      | 0     |
| payments      | 0      | 0     |
| pricing       | 0      | 0     |
| products      | 0      | 0     |
| regions       | 0      | 0     |
| retention     | 0      | 25    |
| risk          | 0      | 0     |
| subscriptions | 0      | 0     |
| support       | 0      | 0     |
| treasury      | 0      | 0     |

| Operation                      | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ------------------------------ | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments                | True    | 28675 | None   | 0                      | False    | False               |
| deploy merchants (1300 → 900)  | True    | 22025 | None   | 0                      | False    | False               |
| deploy finance (900 → 100)     | True    | 15806 | None   | 0                      | False    | False               |
| deploy risk (100 → 100)        | True    | 15721 | None   | 0                      | False    | False               |
| deploy growth (100 → 100)      | True    | 16231 | None   | 0                      | False    | False               |
| deploy marketing (100 → 100)   | True    | 14257 | None   | 0                      | False    | False               |
| deploy accounts (100 → 25)     | True    | 12385 | None   | 0                      | False    | False               |
| deploy billing (25 → 25)       | True    | 13014 | None   | 0                      | False    | False               |
| deploy catalog (25 → 25)       | True    | 12835 | None   | 0                      | False    | False               |
| deploy contracts (25 → 25)     | True    | 12598 | None   | 0                      | False    | False               |
| deploy inventory (25 → 25)     | True    | 12698 | None   | 0                      | False    | False               |
| deploy loyalty (25 → 25)       | True    | 12531 | None   | 0                      | False    | False               |
| deploy subscriptions (25 → 25) | True    | 12625 | None   | 0                      | False    | False               |
| deploy support (25 → 25)       | True    | 12523 | None   | 0                      | False    | False               |
| deploy delivery (25 → 25)      | True    | 13095 | None   | 0                      | False    | False               |
| deploy pricing (25 → 25)       | True    | 12584 | None   | 0                      | False    | False               |
| deploy treasury (25 → 25)      | True    | 12658 | None   | 0                      | False    | False               |
| deploy compliance (25 → 25)    | True    | 12944 | None   | 0                      | False    | False               |
| deploy products (25 → 25)      | True    | 12820 | None   | 0                      | False    | False               |
| deploy regions (25 → 25)       | True    | 12989 | None   | 0                      | False    | False               |
| deploy fulfilment (25 → 25)    | True    | 12833 | None   | 0                      | False    | False               |
| deploy retention (25 → 25)     | True    | 12763 | None   | 0                      | False    | False               |

Project config after:

```json
{
    "parameters": {},
    "spotlight_tags": [],
    "table_groups": {
        "operations": {
            "label": "Operations"
        }
    },
    "defaults": {
        "column_totals": true,
        "case_sensitive": false
    }
}
```

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>
