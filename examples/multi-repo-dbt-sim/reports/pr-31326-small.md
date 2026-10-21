# Deploy-head comparison

Synthetic deploy comparison completed. All 24 CLI compilations succeed. Five explicit-source deployments succeed; all 19 deployments without the flag return HTTP 409. No harness errors.

Fixture base: `5cb32ce9ad9d5c8774451d6a09ed36a6135a7f4e`
Tested PR head: `4629b2f651098b48e90f0cd340253980af03bcf1`
Signed local integration: `d564fed7d4daf093277b3b80102c4485c203689e`
Small scale, seed 42. The tested head is integrated with the pinned main baseline and fixture in an unpublished T3 worktree.

| Scenario              | Compile | Deploy | HTTP 409 | Explores after | Mode   |
| --------------------- | ------- | ------ | -------- | -------------- | ------ |
| cli-deploy            | 6/6     | 0/6    | 6        | 0              | single |
| cli-source            | 6/6     | 5/6    | 1        | 13             | single |
| config-none           | 2/2     | 0/2    | 2        | 0              | single |
| config-partial        | 2/2     | 0/2    | 2        | 0              | single |
| cli-collision         | 2/2     | 0/2    | 2        | 0              | single |
| cli-duplicate-project | 2/2     | 0/2    | 2        | 0              | single |
| cli-join-connected    | 2/2     | 0/2    | 2        | 0              | single |
| cli-join-unconnected  | 1/1     | 0/1    | 1        | 0              | single |
| dbt19-cli             | 1/1     | 0/1    | 1        | 0              | single |

The explicit-source control retains merchants=3, finance=4, risk=2, growth=2 and marketing=2 explores; payments and dbt_project remain at zero. Every other scenario ends with zero explores across all registered sources.

The configuration scenarios cannot prove replacement after a successful deploy. Their rejected payments deploy still adds minimum_amount, the Payments tag, commerce/operations groups and defaults. The rejected growth/marketing follow-up clears the parameter and tag, while both groups and defaults remain. These snapshots contradict the rejection text claiming that nothing changed.

Collision and chart/data survival are inconclusive. The initial deploy fails, and chart creation returns HTTP 404: Explore "ledger" does not exist. The raw original_source_preserved=false is not evidence of chart loss. Duplicate-project inference is also inconclusive because source metadata was never populated.

Both join cases compile six payments explores (four SUCCESS, two PARTIAL_SUCCESS, zero errors), with the warning below. Deploys fail and explore lookup returns 404. In the connected case, the upstream is registered but its deployment also fails. No deployed join, import or upstream-preservation conclusion is available.

Exact representative HTTP 409 message (all responses are retained in pr-31326-small.json):

```text
This deploy was not saved and nothing in the project changed.
The project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.

To fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.

Sources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.
```

Exact join warning:

```text
Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

Exact guidance from each explicit-source deployment:

```text
--source is deprecated and will be ignored in a future release. Lightdash now works out which dbt source a deploy belongs to from your dbt project. You only need it if the deploy is rejected because the source can't be inferred.
```

The original capture missed the conditional recommendation in that deprecation warning. The corrected classifier flags it in the exported JSON. The exact message remains unchanged.

The warehouse passes 24 stages in 116 seconds wall time, including a 30-second load wait. The nine scenarios take 312 seconds. Common and CLI are force-rebuilt from the integration. The API bundle is rebuilt and restarted, ownership is checked, and real HTTP health returns 200. Private environments use dbt 1.12.3/1.9.10 and dbt-loom 0.9.6.

Cleanup verified: this ldenv instance is stopped, its API port is closed, the fixture runner and its HTTP servers have exited, and its URL-scoped Git TLS trust key is absent. No worktree retirement, push, PR change or product fix is performed. Only the pre-existing generated Swagger file remains tracked and dirty.

## Operation records

Baseline revision: `d564fed7d4daf093277b3b80102c4485c203689e`. Scale: `small`. Seed: `42`.

| Scenario              | Mode | Before → after | Last operation | Passes | Parameters / tags / groups |
| --------------------- | ---- | -------------- | -------------- | ------ | -------------------------- |
| cli-deploy            | cli  | 0 → 0          | failure        | None   | 0/0/1                      |
| cli-source            | cli  | 0 → 13         | success        | None   | 0/0/1                      |
| config-none           | cli  | 0 → 0          | failure        | None   | 0/0/2                      |
| config-partial        | cli  | 0 → 0          | failure        | None   | 0/0/2                      |
| cli-collision         | cli  | 0 → 0          | failure        | None   | 0/0/2                      |
| cli-duplicate-project | cli  | 0 → 0          | failure        | None   | 0/0/2                      |
| cli-join-connected    | cli  | 0 → 0          | failure        | None   | 1/1/2                      |
| cli-join-unconnected  | cli  | 0 → 0          | failure        | None   | 1/1/2                      |
| dbt19-cli             | cli  | 0 → 0          | failure        | None   | 0/0/0                      |

<details><summary>cli-deploy</summary>

Sequential full deploys can erase sibling explores before reworked #31326

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 0     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation                | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ------------------------ | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments          | False   | 13094 | None   | 0                      | True     | False               |
| deploy merchants (0 → 0) | False   | 12588 | None   | 0                      | True     | False               |
| deploy finance (0 → 0)   | False   | 12539 | None   | 0                      | True     | False               |
| deploy risk (0 → 0)      | False   | 12204 | None   | 0                      | True     | False               |
| deploy growth (0 → 0)    | False   | 10873 | None   | 0                      | True     | False               |
| deploy marketing (0 → 0) | False   | 12336 | None   | 0                      | True     | False               |

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
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project merchants.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project finance.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project risk.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project growth.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project marketing.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}
```

</details>

<details><summary>cli-source</summary>

Explicit-source diagnostic control; not the normal CLI workflow

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| finance     | 0      | 4     |
| growth      | 0      | 2     |
| marketing   | 0      | 2     |
| merchants   | 0      | 3     |
| payments    | 0      | 0     |
| risk        | 0      | 2     |

| Operation                  | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| -------------------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments            | False   | 12676 | None   | 0                      | True     | False               |
| deploy merchants (0 → 3)   | True    | 12542 | None   | 0                      | False    | True                |
| deploy finance (3 → 7)     | True    | 13076 | None   | 0                      | False    | True                |
| deploy risk (7 → 9)        | True    | 12909 | None   | 0                      | False    | True                |
| deploy growth (9 → 11)     | True    | 12164 | None   | 0                      | False    | True                |
| deploy marketing (11 → 13) | True    | 12874 | None   | 0                      | False    | True                |

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
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}
```

</details>

<details><summary>config-none</summary>

Missing parameters/categories still erase project configuration

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 0     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation       | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments | False   | 12123 | None   | 0                      | True     | False               |
| deploy growth   | False   | 11471 | None   | 0                      | True     | False               |

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
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project growth.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}
```

</details>

<details><summary>config-partial</summary>

Partial configuration still replaces project configuration

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 0     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation        | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ---------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments  | False   | 12358 | None   | 0                      | True     | False               |
| deploy marketing | False   | 12396 | None   | 0                      | True     | False               |

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
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project marketing.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}
```

</details>

<details><summary>cli-collision</summary>

Capture collision status and guidance; #31326 adds HTTP 409

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 0     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation        | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ---------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments  | False   | 12603 | None   | 0                      | True     | False               |
| deploy marketing | False   | 12665 | None   | 0                      | True     | False               |

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
Original chart created: `False`. Original query resolves before/after: `False` / `False`.

Errors and guidance:

```text
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project marketing.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}
```

</details>

<details><summary>cli-duplicate-project</summary>

Record source inference for duplicate dbt project names

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| finance     | 0      | 0     |
| growth      | 0      | 0     |
| marketing   | 0      | 0     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |
| risk        | 0      | 0     |

| Operation        | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ---------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments  | False   | 12748 | None   | 0                      | True     | False               |
| deploy marketing | False   | 12965 | None   | 0                      | True     | False               |

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
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project growth.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants, finance, risk, growth, marketing.","data":{}}}
```

</details>

<details><summary>cli-join-connected</summary>

Loom resolves upstream refs; record whether an already deployed upstream preserves the join

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| merchants   | 0      | 0     |
| payments    | 0      | 0     |

| Operation        | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ---------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy merchants | False   | 12796 | None   | 0                      | True     | False               |
| deploy payments  | False   | 12576 | None   | 0                      | True     | False               |

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
            "name": "Payments",
            "color": "blue",
            "yamlReference": "payments",
            "createdBy": {
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
    "compile_success": true,
    "deploy_success": false,
    "join_present": false,
    "join_lookup_status": 404,
    "upstream_explore_after": false,
    "messages": [
        "HTTP 409: {\"status\":\"error\",\"error\":{\"statusCode\":409,\"name\":\"ConflictError\",\"message\":\"This deploy was not saved and nothing in the project changed.\\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\\n\\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\\n\\nSources in this project: dbt_project, payments, merchants.\",\"data\":{}}}",
        "\nDeploying to project: <id>\n\n\n\n- SUCCESS> rate_v2_usage \n- SUCCESS> rate_v1_usage \n- SUCCESS> rate_latest_usage \n- PARTIAL_SUCCESS> payments \n    \u26a0 Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.\n- SUCCESS> settlement \n- PARTIAL_SUCCESS> ledger \n    \u26a0 Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.\n\nCompiled 6 explores, SUCCESS=4 PARTIAL_SUCCESS=2 ERRORS=0\nDeploying 6 explores using batched deploy (batch size: 50, parallel: 1)\nStarting deploy session...\nDeploy session created: <id>\nUploading 1 batches...\n  Uploading batch 1/1 (6 explores)...\n  \u2713 Batch 1 uploaded (6 explores)\nFinalizing deploy...\nThis deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants.\n\n\ud83d\udca1 Run lightdash diagnostics for more info.\n\n"
    ]
}
```

Errors and guidance:

```text
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project merchants.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants.","data":{}}}

HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments, merchants.","data":{}}}
```

</details>

<details><summary>cli-join-unconnected</summary>

Loom resolves upstream refs without registering the upstream; record join and explore availability

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| payments    | 0      | 0     |

| Operation       | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| --------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy payments | False   | 13238 | None   | 0                      | True     | False               |

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
            "name": "Payments",
            "color": "blue",
            "yamlReference": "payments",
            "createdBy": {
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
    "compile_success": true,
    "deploy_success": false,
    "join_present": false,
    "join_lookup_status": 404,
    "upstream_explore_after": false,
    "messages": [
        "HTTP 409: {\"status\":\"error\",\"error\":{\"statusCode\":409,\"name\":\"ConflictError\",\"message\":\"This deploy was not saved and nothing in the project changed.\\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\\n\\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\\n\\nSources in this project: dbt_project, payments.\",\"data\":{}}}",
        "\nDeploying to project: <id>\n\n\n\n- SUCCESS> rate_v2_usage \n- SUCCESS> rate_v1_usage \n- SUCCESS> rate_latest_usage \n- PARTIAL_SUCCESS> payments \n    \u26a0 Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.\n- SUCCESS> settlement \n- PARTIAL_SUCCESS> ledger \n    \u26a0 Join \"merchant\" to table \"merchant\" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.\n\nCompiled 6 explores, SUCCESS=4 PARTIAL_SUCCESS=2 ERRORS=0\nDeploying 6 explores using batched deploy (batch size: 50, parallel: 1)\nStarting deploy session...\nDeploy session created: <id>\nUploading 1 batches...\n  Uploading batch 1/1 (6 explores)...\n  \u2713 Batch 1 uploaded (6 explores)\nFinalizing deploy...\nThis deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments.\n\n\ud83d\udca1 Run lightdash diagnostics for more info.\n\n"
    ]
}
```

Errors and guidance:

```text
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project payments.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, payments.","data":{}}}
```

</details>

<details><summary>dbt19-cli</summary>

Repo compiled with dbt 1.9 deploys

Connection mode: `single`. API route: `single`.

| Source      | Before | After |
| ----------- | ------ | ----- |
| dbt_project | 0      | 0     |
| growth      | 0      | 0     |

| Operation     | Success | ms    | Passes | Git discovery requests | HTTP 409 | Recommends --source |
| ------------- | ------- | ----- | ------ | ---------------------- | -------- | ------------------- |
| deploy growth | False   | 11184 | None   | 0                      | True     | False               |

Project config after:

```json
{
    "parameters": {},
    "spotlight_tags": [],
    "table_groups": {},
    "defaults": null
}
```

Errors and guidance:

```text
HTTP 409: {"status":"error","error":{"statusCode":409,"name":"ConflictError","message":"This deploy was not saved and nothing in the project changed.\nThe project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project growth.\n\nTo fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.\n\nSources in this project: dbt_project, growth.","data":{}}}
```

</details>
