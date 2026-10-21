Baseline revision: `b7dd419f984c6eb707635bc40bc784c81f06c614`. Scale: `small`. Seed: `42`.

| Scenario              | Mode   | Before → after | Last operation | Passes | Parameters / tags / groups |
| --------------------- | ------ | -------------- | -------------- | ------ | -------------------------- |
| config-none           | cli    | 6 → 2          | success        | None   | 0/0/2                      |
| config-partial        | cli    | 6 → 2          | success        | None   | 0/0/2                      |
| cli-join              | cli    | 6 → 6          | success        | None   | 1/1/2                      |
| dbt19-cli             | cli    | 2 → 2          | success        | None   | 0/0/0                      |
| baseline              | server | 19 → 19        | success        | 1      | 1/1/2                      |
| ambiguity             | server | 19 → 19        | failure        | None   | 1/1/2                      |
| unreadable            | server | 19 → 19        | failure        | None   | 1/1/2                      |
| empty-selector        | server | 19 → 17        | success        | 1      | 1/1/2                      |
| warn-error            | server | 19 → 17        | success        | 1      | 1/1/2                      |
| cli-join-connected    | cli    | 3 → 6          | success        | None   | 1/1/2                      |
| cli-join-unconnected  | cli    | 6 → 6          | success        | None   | 1/1/2                      |
| duplicate-project     | server | 19 → 19        | failure        | None   | 1/1/2                      |
| versioned             | server | 19 → 19        | success        | 1      | 1/1/2                      |
| scale                 | server | 19 → 19        | success        | 1      | 1/1/2                      |
| cli-deploy            | cli    | 6 → 2          | success        | None   | 0/0/1                      |
| cli-source            | cli    | 6 → 2          | success        | None   | 0/0/1                      |
| collision             | server | 17 → 20        | success        | 1      | 1/1/2                      |
| cli-duplicate-project | cli    | 6 → 2          | success        | None   | 0/0/2                      |
| dbt19-server          | server | 19 → 19        | success        | 1      | 0/0/0                      |
| server-join           | server | 9 → 9          | success        | 1      | 1/1/2                      |
| refresh-after-cli     | server | 19 → 19        | success        | 1      | 1/1/2                      |
| cli-collision         | cli    | 6 → 3          | success        | None   | 0/0/2                      |

<details><summary>config-none</summary>

Missing parameters/categories still erase project configuration

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 2     |
| marketing   | 0      | 0     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation       | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments | True    | 12747 | None   | None                   | False    | False               |
| deploy growth   | True    | 11188 | None   | None                   | False    | False               |

Project config after:

```json
{
    "parameters": {},
    "spotlight_tags": [],
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

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>

<details><summary>config-partial</summary>

Partial configuration still replaces project configuration

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 2     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation        | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ---------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments  | True    | 13102 | None   | None                   | False    | False               |
| deploy marketing | True    | 13130 | None   | None                   | False    | False               |

Project config after:

```json
{
    "parameters": {},
    "spotlight_tags": [],
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

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>

<details><summary>cli-join</summary>

Record whether the cross-repo join fails or is dropped

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 0     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation       | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments | True    | 13299 | None   | None                   | False    | False               |

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

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>

<details><summary>dbt19-cli</summary>

Repo compiled with dbt 1.9 deploys

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| growth      | 2      | 2     |

| Operation     | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy growth | True    | 11438 | None   | None                   | False    | False               |

Project config after:

```json
{
    "parameters": {},
    "spotlight_tags": [],
    "table_groups": {},
    "defaults": null
}
```

</details>

<details><summary>baseline</summary>

Ring, shared upstream, mixed refs and joins compile

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 2     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 20237 | 1      | 11                     | False    | False               |

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

<details><summary>ambiguity</summary>

One-argument-only reference fails with a clear ambiguity error

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 2     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 20206 | 1      | 11                     | False    | False               |
| refresh   | False   | 18221 | None   | 11                     | False    | False               |

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

Errors and guidance:

```text
dbt source "finance" references ref('settlement'), but the name 'settlement' is defined by several dbt sources. Use ref('project', 'model') to select a source.
```

</details>

<details><summary>unreadable</summary>

Refresh fails as a whole; pending isolation work keeps last-good explores

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 2     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 22234 | 1      | 11                     | False    | False               |
| refresh   | False   | 4069  | None   | 6                      | False    | False               |

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
Failed to load dbt source "marketing" (sim/marketing): Unexpected error while cloning git repository: Command failed with exit code 128: git clone --single-branch --depth=1 --branch=main --no-tags --progress https://localhost:43933/sim/marketing.git /tmp/git_fOlatP
Cloning into '/tmp/git_fOlatP'...
fatal: unable to access 'https://localhost:43933/sim/marketing.git/': The requested URL returned error: 403
```

</details>

<details><summary>empty-selector</summary>

Empty selection fails before #31283

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 0     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 24308 | 1      | 11                     | False    | False               |
| refresh   | True    | 20297 | 1      | 11                     | False    | False               |

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

<details><summary>warn-error</summary>

NoNodesForSelectionCriteria fails unless explicitly suppressed

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 0     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 20241 | 1      | 11                     | False    | False               |
| refresh   | False   | 20185 | None   | 11                     | False    | False               |
| refresh   | True    | 20175 | 1      | 11                     | False    | False               |

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

Errors and guidance:

```text
Failed to load dbt source "marketing" (sim/marketing): Failed to run "dbt1.12 ls --output json --output-keys unique_id --select tag:sim_missing_tag" with dbt version "v1.12"

[ERROR]: Encountered an error:
Compilation Error
  [WARNING]: The selection criterion 'tag:sim_missing_tag' does not match any enabled nodes
```

</details>

<details><summary>cli-join-connected</summary>

Loom resolves upstream refs; record whether an already deployed upstream preserves the join

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 6     |
| merchants   | 3      | 0     |
| payments    | 0      | 0     |

| Operation        | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ---------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy merchants | True    | 12604 | None   | None                   | False    | False               |
| deploy payments  | True    | 12754 | None   | None                   | False    | False               |

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

Join observation:

```json
{
    "upstream_registered": true,
    "compile_and_deploy_success": true,
    "compile_success": true,
    "deploy_success": true,
    "joined_tables": [],
    "join_present": false,
    "upstream_explore_before": true,
    "upstream_explore_after": false,
    "messages": [
        "    \u26a0 Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.",
        "- payments: Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.",
        "- ledger: Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project."
    ],
    "loom_upstream_model_in_manifest": true,
    "downstream_depends_on_upstream": true
}
```

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>

<details><summary>cli-join-unconnected</summary>

Loom resolves upstream refs without registering the upstream; record join and explore availability

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| payments    | 0      | 0     |

| Operation       | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments | True    | 13242 | None   | None                   | False    | False               |

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

Join observation:

```json
{
    "upstream_registered": false,
    "compile_and_deploy_success": true,
    "compile_success": true,
    "deploy_success": true,
    "joined_tables": [],
    "join_present": false,
    "upstream_explore_before": false,
    "upstream_explore_after": false,
    "messages": [
        "    \u26a0 Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.",
        "- payments: Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.",
        "- ledger: Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project."
    ],
    "loom_upstream_model_in_manifest": true,
    "downstream_depends_on_upstream": true
}
```

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>

<details><summary>duplicate-project</summary>

Duplicate dbt project names fail early

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 2     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 20206 | 1      | 11                     | False    | False               |
| refresh   | False   | 6057  | None   | 6                      | False    | False               |

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

Errors and guidance:

```text
dbt sources "growth" and "marketing" both use the dbt project name "growth". Each connected dbt source needs a unique `name:` value in dbt_project.yml. Change the name in one of the repositories.
```

</details>

<details><summary>versioned</summary>

Pinned/latest refs may require an extra cold parse

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 2     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 22303 | 1      | 11                     | False    | False               |
| refresh   | True    | 18179 | 1      | 11                     | False    | False               |

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

<details><summary>scale</summary>

Many sources compile; record Git discovery count and timing

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 2     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 22217 | 1      | 11                     | False    | False               |

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

<details><summary>cli-deploy</summary>

Sequential full deploys can erase sibling explores before reworked #31326

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 2     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation                | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ------------------------ | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments          | True    | 12894 | None   | None                   | False    | False               |
| deploy merchants (6 → 3) | True    | 13271 | None   | None                   | False    | False               |
| deploy finance (3 → 4)   | True    | 13967 | None   | None                   | False    | False               |
| deploy risk (4 → 2)      | True    | 14256 | None   | None                   | False    | False               |
| deploy growth (2 → 2)    | True    | 12653 | None   | None                   | False    | False               |
| deploy marketing (2 → 2) | True    | 13807 | None   | None                   | False    | False               |

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

<details><summary>cli-source</summary>

Explicit-source diagnostic control; not the normal CLI workflow

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 2     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation                | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ------------------------ | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments          | True    | 13367 | None   | None                   | False    | False               |
| deploy merchants (6 → 3) | True    | 13081 | None   | None                   | False    | False               |
| deploy finance (3 → 4)   | True    | 12446 | None   | None                   | False    | False               |
| deploy risk (4 → 2)      | True    | 12552 | None   | None                   | False    | False               |
| deploy growth (2 → 2)    | True    | 11760 | None   | None                   | False    | False               |
| deploy marketing (2 → 2) | True    | 12793 | None   | None                   | False    | False               |

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

<details><summary>collision</summary>

Newcomer renames both explores; pending naming work preserves original

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 0      | 3     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 20305 | 1      | 9                      | False    | False               |
| refresh   | True    | 22223 | 1      | 11                     | False    | False               |

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

<details><summary>cli-duplicate-project</summary>

Record source inference for duplicate dbt project names

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 2     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation        | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ---------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments  | True    | 13479 | None   | None                   | False    | False               |
| deploy marketing | True    | 13429 | None   | None                   | False    | False               |

Project config after:

```json
{
    "parameters": {},
    "spotlight_tags": [],
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

CLI source inference:

```json
{
    "dbt_project_name": "growth",
    "model_repo": "marketing",
    "source_marker_present": false,
    "assigned_source": null
}
```

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>

<details><summary>dbt19-server</summary>

Project-wide dbt 1.9 compile succeeds

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 2      | 2     |
| finance     | 4      | 4     |
| marketing   | 2      | 2     |
| merchants   | 3      | 3     |
| payments    | 6      | 6     |
| risk        | 2      | 2     |

| Operation | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 20189 | 1      | 11                     | False    | False               |

Project config after:

```json
{
    "parameters": {},
    "spotlight_tags": [],
    "table_groups": {},
    "defaults": null
}
```

</details>

<details><summary>server-join</summary>

Refresh resolves the same cross-repo join and exposes the upstream model

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| merchants   | 3      | 3     |

| Operation | Success | ms   | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------- | ------- | ---- | ------ | ---------------------- | -------- | ------------------- |
| refresh   | True    | 6093 | 1      | 2                      | False    | False               |

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

Join observation:

```json
{
    "upstream_registered": true,
    "compile_and_deploy_success": true,
    "compile_success": true,
    "deploy_success": null,
    "joined_tables": [
        {
            "sqlOn": "${payments.merchant_id} = ${merchant.id}",
            "table": "merchant",
            "relationship": "many-to-one",
            "compiledSqlOn": "(\"payments\".merchant_id) = (\"merchant\".id)",
            "tablesReferences": ["payments", "merchant"]
        }
    ],
    "join_present": true,
    "upstream_explore_before": true,
    "upstream_explore_after": true,
    "messages": [],
    "joined_query": {
        "resolves": true,
        "row_count": 3,
        "labels": [
            "merchants_sample_1",
            "merchants_sample_2",
            "merchants_sample_3"
        ]
    }
}
```

</details>

<details><summary>refresh-after-cli</summary>

Refresh removes CLI-only explores

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 6     |
| finance     | 4      | 4     |
| growth      | 2      | 2     |
| marketing   | 2      | 2     |
| merchants   | 3      | 3     |
| risk        | 2      | 2     |

| Operation       | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| refresh         | True    | 22207 | 1      | 11                     | False    | False               |
| deploy payments | True    | 14442 | None   | 0                      | False    | False               |
| refresh         | True    | 20157 | 1      | 11                     | False    | False               |

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

git_head_unchanged: `True`.
After CLI deploy: `7` explores. CLI-only model present after deploy/refresh: `True` / `False`.

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>

<details><summary>cli-collision</summary>

Capture collision status and guidance; #31326 adds HTTP 409

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 6      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 3     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation        | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ---------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments  | True    | 12673 | None   | 0                      | False    | False               |
| deploy marketing | True    | 12521 | None   | 0                      | False    | False               |

Project config after:

```json
{
    "parameters": {},
    "spotlight_tags": [],
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
Original chart created: `True`. Original query resolves before/after: `True` / `True`.

Errors and guidance:

```text
    ⚠ Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- payments: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.

- ledger: Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

</details>
