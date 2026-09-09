// Generated from canonical documentation. Run scope-tours/concepts/generate.ts.
import type { ConceptLesson } from './conceptLesson';
export const CONCEPT_LESSONS: Record<string, ConceptLesson> = {
    'manage:DeletedContent': {
        title: 'Understand restoring and permanently deleting content',
        coveredScopes: ['manage:DeletedContent'],
        sections: [
            {
                heading: 'Recently deleted charts and dashboards',
                body: "When soft delete is enabled, charts and dashboards deleted within the retention window (30 days by default) can be restored or permanently deleted from the **Recently deleted** page in project settings.\n\nYou need access to the project. Users with **Manage soft-deleted content** (`manage:DeletedContent`) can review and manage items deleted by other users. Without that permission, you can only see and manage items you deleted.\n\nTo access it, go to **Project settings** → **Recently deleted**. For each item you'll see who deleted it and when, along with options to:\n\n* **Restore** the item back to its original space.\n* **Delete permanently** to remove it immediately. Confirm **Delete permanently** in the dialog; the item can no longer be restored.\n\nItems in **Recently deleted** are automatically purged after the configured retention window.\n\nSelf-hosted Soft delete is opt-in. Set `SOFT_DELETE_ENABLED=true` to route deletes through **Recently deleted** instead of removing items immediately, and optionally set `SOFT_DELETE_RETENTION_DAYS` (default `30`) to change the retention window. See [environment variables](https://docs.lightdash.com/self-host/customize-deployment/environment-variables).",
                sourceUrl:
                    'https://docs.lightdash.com/explore/version-history#recently-deleted-charts-and-dashboards',
                sourceLabel: 'Recently deleted charts and dashboards',
                sourceHash:
                    'eef8463497e4f4eb3b8245d27d680f4e014c43b6f531e5948e77e7bb0f95dfd8',
            },
        ],
    },
    'view:ContentVerification': {
        title: 'Recognize verified content',
        coveredScopes: ['view:ContentVerification'],
        sections: [
            {
                heading: 'Where users see verified content',
                body: "Once a chart or dashboard is verified, the green checkmark badge appears wherever that content is surfaced, including:\n\n- The homepage, so users can quickly spot approved content to start from\n- Chart and dashboard listings\n- Inside the chart or dashboard itself, along with the verifier's name and verification timestamp\n\nThis makes it easy for teams to distinguish between exploratory or work-in-progress content and content that's been reviewed and approved.",
                sourceUrl:
                    'https://docs.lightdash.com/explore/verified-content#where-users-see-verified-content',
                sourceLabel: 'Where users see verified content',
                sourceHash:
                    'e1fccac7cbf8f9037d6fc44e47174c2c518499932703485122767dff5a38dc09',
            },
        ],
    },
    'manage:VerifiedContent': {
        title: 'Understand edits to verified content',
        coveredScopes: ['manage:VerifiedContent'],
        sections: [
            {
                heading: 'Who can edit or delete verified content',
                body: 'Editing or deleting a verified chart or dashboard requires the usual permission to edit or delete that content, plus **Edit or delete verified charts and dashboards** (`manage:VerifiedContent`). The original verifier can also change the content without that additional scope. Developers and admins receive the scope by default; a custom role can grant it to other users.\n\nWithout that scope or the original-verifier exception, verified content is read-only. Permission to edit verified content is separate from permission to preserve or apply its verified badge when saving.',
                sourceUrl:
                    'https://docs.lightdash.com/explore/verified-content#who-can-edit-or-delete-verified-content',
                sourceLabel: 'Who can edit or delete verified content',
                sourceHash:
                    'e1fccac7cbf8f9037d6fc44e47174c2c518499932703485122767dff5a38dc09',
            },
            {
                heading: 'What happens to verification when content is edited',
                body: "Verification is tied to the exact state of the content at the time it was verified, so editing a verified chart or dashboard puts its badge at risk. To make sure the badge never disappears silently, Lightdash shows a confirmation dialog whenever you save changes to verified content. What you can do in that dialog depends on whether you're allowed to preserve verification:\n\n- **If you can verify content** (you have verify permission, or you're the original verifier), you're offered the choice to keep the badge as part of saving. Choosing **Save & verify** re-approves the current version and keeps the badge (updating the verification timestamp to your save); choosing **Save** drops it.\n- **If you can't verify content** (for example, a custom role that allows editing verified content but not verifying it), saving removes the badge. You're warned first and can cancel, but you can't keep it — someone with verify permission then needs to review the updated version and re-verify it.\n\nThis guarantees a verified badge always reflects content that someone with verify permission has explicitly approved in its current form.\n\n### What you see when saving verified content\n\nThe confirmation dialog comes in two variants:\n\n- **If you can keep the badge** (verify permission or original verifier), you get a **Keep this verified after saving?** prompt with two options: **Save** drops the badge, and **Save & verify** keeps it and updates the verification timestamp to your save. Note there's no automatic retention — even the original verifier keeps the badge only by choosing **Save & verify**.\n- **If you cannot keep the badge**, you get a warning: *\"Saving your changes will remove its verified status until someone verifies it again.\"* You can **Cancel** to back out, or **Save anyway** to save and drop the badge.\n\nFor example, if a user with permission to edit verified content but not to verify it edits the **Ecom sales overview** dashboard (verified by someone else), they'll see the warning and can decide whether to save and drop the badge or cancel and let the verifier make the change instead.",
                sourceUrl:
                    'https://docs.lightdash.com/explore/verified-content#what-happens-to-verification-when-content-is-edited',
                sourceLabel:
                    'What happens to verification when content is edited',
                sourceHash:
                    'e1fccac7cbf8f9037d6fc44e47174c2c518499932703485122767dff5a38dc09',
            },
        ],
    },
    'manage:CustomSql': {
        title: 'Understand saving SQL charts',
        coveredScopes: ['manage:CustomSql'],
        sections: [
            {
                heading: 'Saved charts in the SQL Runner',
                body: "Once you've run your query, you can build a chart by clicking on the `chart` tab in the SQL Runner.\n\nThe charts in the SQL Runner are built from the data that you generated in your query. The chart builder automatically aggregates the data from your query results using the aggregation type that you choose. Depending on the column type, the aggregation options are:\n\n- count (which is a distinct count and will ignore duplicates)\n- any (which will count and include duplicates)\n- sum\n- average\n- max\n- min\n\nOnce you've configured your chart, you can save it, add it to a space, and add it to a dashboard by hitting `save chart`.\n\nSQL runner charts on a dashboard can be filtered in the UI. See the [dashboard filter documentation](https://docs.lightdash.com/explore/dashboards/filter#filtering-charts-created-in-the-sql-runner) for more information.\n\n### Chart types\n\nThe SQL runner supports the following chart types:\n\n* Table\n* Bar chart\n* Line chart\n* Pie chart\n* Big number",
                sourceUrl:
                    'https://docs.lightdash.com/explore/sql-runner#saved-charts-in-the-sql-runner',
                sourceLabel: 'Saved charts in the SQL Runner',
                sourceHash:
                    'fe270060044c390341bdf6528f923ef059aea0b7dcca78e1d07e78456442bd9b',
            },
            {
                heading: 'Limitations',
                body: "### ORDER BY not guaranteed\n\nResults from the SQL runner are not guaranteed to respect your `ORDER BY` clause. This is because Lightdash wraps your query in a subquery to support dashboard filtering, and SQL databases don't preserve ordering from subqueries.\n\n**Common symptoms:** Results appear in wrong order, sorting doesn't work, ORDER BY ignored, sort order not preserved.",
                sourceUrl:
                    'https://docs.lightdash.com/explore/sql-runner#limitations',
                sourceLabel: 'Limitations',
                sourceHash:
                    'fe270060044c390341bdf6528f923ef059aea0b7dcca78e1d07e78456442bd9b',
            },
        ],
    },
    'manage:VirtualView': {
        title: 'Understand virtual view changes',
        coveredScopes: ['manage:VirtualView', 'delete:VirtualView'],
        sections: [
            {
                heading: 'Edit or delete a virtual view',
                body: "To edit a virtual view, you need to open it in the Explorer, then beside the name, there's a three-dot-menu where you can choose to `edit` or `delete` the virtual view.\n\nAny changes you make will affect all existing content built using the virtual view.",
                sourceUrl:
                    'https://docs.lightdash.com/semantic-layer/virtual-views#edit-or-delete-a-virtual-view',
                sourceLabel: 'Edit or delete a virtual view',
                sourceHash:
                    'f72ce4eb4e68cdce349ec131fea6bf83a5210992c35a92314aba68a8bd8e2b30',
            },
            {
                heading: 'Destructive changes and --force',
                body: 'Removing a column or changing its type is a **destructive** change — any charts or dashboards that reference the removed or retyped column will break. To protect against accidental breakage, the CLI rejects destructive column changes by default and lists the offending columns in the error.\n\nRe-run the upload with `--force` when the change is intentional:\n\n```bash\nlightdash upload --virtual-views orders_enriched --force\n```\n\n`--force` also allows replacing a virtual view whose cached state can no longer be represented as YAML (for example, a legacy view with non-subquery SQL).',
                sourceUrl:
                    'https://docs.lightdash.com/semantic-layer/virtual-views#destructive-changes-and---force',
                sourceLabel: 'Destructive changes and --force',
                sourceHash:
                    'f72ce4eb4e68cdce349ec131fea6bf83a5210992c35a92314aba68a8bd8e2b30',
            },
        ],
    },
    'delete:VirtualView': {
        title: 'Understand virtual view changes',
        coveredScopes: ['manage:VirtualView', 'delete:VirtualView'],
        sections: [
            {
                heading: 'Edit or delete a virtual view',
                body: "To edit a virtual view, you need to open it in the Explorer, then beside the name, there's a three-dot-menu where you can choose to `edit` or `delete` the virtual view.\n\nAny changes you make will affect all existing content built using the virtual view.",
                sourceUrl:
                    'https://docs.lightdash.com/semantic-layer/virtual-views#edit-or-delete-a-virtual-view',
                sourceLabel: 'Edit or delete a virtual view',
                sourceHash:
                    'f72ce4eb4e68cdce349ec131fea6bf83a5210992c35a92314aba68a8bd8e2b30',
            },
            {
                heading: 'Destructive changes and --force',
                body: 'Removing a column or changing its type is a **destructive** change — any charts or dashboards that reference the removed or retyped column will break. To protect against accidental breakage, the CLI rejects destructive column changes by default and lists the offending columns in the error.\n\nRe-run the upload with `--force` when the change is intentional:\n\n```bash\nlightdash upload --virtual-views orders_enriched --force\n```\n\n`--force` also allows replacing a virtual view whose cached state can no longer be represented as YAML (for example, a legacy view with non-subquery SQL).',
                sourceUrl:
                    'https://docs.lightdash.com/semantic-layer/virtual-views#destructive-changes-and---force',
                sourceLabel: 'Destructive changes and --force',
                sourceHash:
                    'f72ce4eb4e68cdce349ec131fea6bf83a5210992c35a92314aba68a8bd8e2b30',
            },
        ],
    },
    'manage:ChangeCsvResults': {
        title: 'Choose export result options',
        coveredScopes: ['manage:ChangeCsvResults'],
        sections: [
            {
                heading: 'Choosing how many rows an export contains',
                body: "The download dialog also asks how the values should be written — `Formatted` keeps the table's presentation, `Raw` uses the underlying values — and, for interactive viewers and above, the **result scope**:\n\n- `Table rows` exports exactly the rows currently loaded in the table.\n- `All results` runs the query for the full result set.\n- `Custom` exports the number of rows you enter.\n\nViewers don't get the result scope choice; their downloads contain the visible table rows.\n\nEvery export is bounded by your organization's [export limits](https://docs.lightdash.com/workspace-admin/export-limits): a CSV or Excel file can hold at most the configured number of cells (rows × columns), so `All results` means as many rows as fit under that cap, and a custom row count above it is reduced to it. Excel files are additionally capped at 1,000,000 rows. Exporting to Google Sheets has no row choice.",
                sourceUrl:
                    'https://docs.lightdash.com/explore/share-charts#choosing-how-many-rows-an-export-contains',
                sourceLabel: 'Choosing how many rows an export contains',
                sourceHash:
                    '379388ec7f00e181297cf163b4e0420595ea8c9eb0ce125e4b65cb8c61fb340a',
            },
        ],
    },
    'view:SpotlightTableConfig': {
        title: 'Read catalog column configuration',
        coveredScopes: ['view:SpotlightTableConfig'],
        sections: [
            {
                heading: 'View catalog column configuration',
                body: "The metrics catalog table has a **Manage column visibility** control (the eye icon). Open it to see which columns are shown and the order they appear in. The **Metric** column is pinned: it cannot be hidden or moved.\n\nYou can toggle the other columns or drag their handles to reorder them for your current view. **Discard** returns to the saved project configuration. Reading the project's saved column configuration uses the **View spotlight table configuration** permission.",
                sourceUrl:
                    'https://docs.lightdash.com/explore/metrics-catalog#view-catalog-column-configuration',
                sourceLabel: 'View catalog column configuration',
                sourceHash:
                    '9f5017b7597b7ee766e099fc92de47fec3059ff20e8943d3695d8f574f9981f6',
            },
        ],
    },
    'manage:SpotlightTableConfig': {
        title: 'Understand shared catalog columns',
        coveredScopes: ['manage:SpotlightTableConfig'],
        sections: [
            {
                heading: 'View catalog column configuration',
                body: "The metrics catalog table has a **Manage column visibility** control (the eye icon). Open it to see which columns are shown and the order they appear in. The **Metric** column is pinned: it cannot be hidden or moved.\n\nYou can toggle the other columns or drag their handles to reorder them for your current view. **Discard** returns to the saved project configuration. Reading the project's saved column configuration uses the **View spotlight table configuration** permission.",
                sourceUrl:
                    'https://docs.lightdash.com/explore/metrics-catalog#view-catalog-column-configuration',
                sourceLabel: 'View catalog column configuration',
                sourceHash:
                    '9f5017b7597b7ee766e099fc92de47fec3059ff20e8943d3695d8f574f9981f6',
            },
            {
                heading: 'Save catalog column configuration',
                body: "Users with **Configure spotlight table settings** permission can save the catalog's column visibility and order for everyone in the project. Open **Manage column visibility**, adjust the columns, and select **Save for everyone**.\n\nIf there are unsaved changes, **Discard** restores the saved configuration. With no unsaved changes, **Reset** removes the project's saved configuration and restores the default columns for everyone. These controls configure the catalog table's columns; metric visibility, categories, and time defaults are configured separately through [the spotlight YAML namespace](https://docs.lightdash.com/explore/metrics-catalog#the-spotlight-config).",
                sourceUrl:
                    'https://docs.lightdash.com/explore/metrics-catalog#save-catalog-column-configuration',
                sourceLabel: 'Save catalog column configuration',
                sourceHash:
                    '9f5017b7597b7ee766e099fc92de47fec3059ff20e8943d3695d8f574f9981f6',
            },
        ],
    },
    'view:ContentAsCode': {
        title: 'Read content as code',
        coveredScopes: ['view:ContentAsCode'],
        sections: [
            {
                heading: 'Choosing a workflow',
                body: "There are two main approaches to working with content as code. You can mix and match these within your organization — for example, using disposable editing for quick changes and Git-managed dashboards for production-critical content.\n\n|  | Disposable editing | Git-managed dashboards |\n| --- | --- | --- |\n| **Source of truth** | Lightdash UI | Git repository |\n| **UI editing** | Users with edit access can edit | Restricted to view-only for managed content |\n| **Version history** | Lightdash's built-in history | Full Git audit trail with diffs and blame |\n| **Review process** | None required | Pull requests with approvals |\n| **Setup complexity** | Minimal — just the CLI | Requires CI/CD and space permissions |\n| **Best for** | Quick edits, AI-assisted changes, ad-hoc updates | Regulated environments, multi-instance deployments, teams that want strict change control |",
                sourceUrl:
                    'https://docs.lightdash.com/workflow/content-as-code#choosing-a-workflow',
                sourceLabel: 'Choosing a workflow',
                sourceHash:
                    'a799e9f48d1eae353d75bd8dfc74a926e807cf128f4feb0df87e3dee9d4dd380',
            },
            {
                heading: 'lightdash download',
                body: "From the [Lightdash CLI](https://docs.lightdash.com/workflow/cli/reference), you can use the command `lightdash download` to download all of the charts and dashboards from your Lightdash project as code. All of the charts and dashboards will be written as .yml files to a `lightdash` directory wherever you're running the command.\n\nE.g. if you're running this command inside your dbt directory (eg: `/home/javi/dbt`) then it will create a folder (`/home/javi/dbt/lightdash`). If you're running this command in `/home/javi/documents` it will create the folder in `/home/javi/documents/lightdash`.\n\n##### Running `lightdash download` will overwrite any changes you have locally\n\nFor example:\n\n- I run `lightdash download` and one of the charts that is downloaded is `emea-revenue-per-month.yml`\n- I make some changes to the `emea-revenue-per-month.yml` file and save them\n- I **do not** upload my changes, they are just saved locally\n- I run `lightdash download` again\n- The changes I made to `emea-revenue-per-month.yml` will be overwritten by the latest chart version downloaded from the Lightdash application\n\n### The `.lightdash-metadata.json` file\n\n`lightdash download` writes a `.lightdash-metadata.json` file alongside your content — it's a local-only state file the CLI uses to detect which YAML files you've changed since the last download.\n\n  Add `.lightdash-metadata.json` to your `.gitignore`. It's auto-generated on every download and will produce conflicts if committed.\n\n### Select specific items to download\n\n##### Use `lightdash download -c` or `lightdash download --charts` to select specific charts\n\nIf you only want to download specific charts to manage as code, you can use the chart selector in the download command.\n\nFor example, if I only wanted to download a specific saved chart as code, I would run the command:\n\n```bash\nlightdash download -c https://app.lightdash.cloud/the-url-to-my-saved-chart\n```\n\nYou can use the chart's SLUG, UUID, or the URL to the saved chart to select the chart.\n\n##### Use `lightdash download -d` or `lightdash download --dashboards` to select specific dashboards\n\nThis will download the dashboard and all of the charts in the dashboard as code. For example, if I only wanted to download a specific dashboard as code, I would run the command:\n\n```bash\nlightdash download -d https://app.lightdash.cloud/the-url-to-my-dashboard\n```\n\nYou can use the dashboard's SLUG, UUID, or the URL to the dashboard to select the dashboard.\n\n##### To select multiple charts or dashboards, add a space between the items.\n\nFor example, this command would select two charts to download:\n\n```bash\nlightdash download -c https://app.lightdash.cloud/the-url-to-my-first-saved-chart https://app.lightdash.cloud/the-url-to-my-second-saved-chart\n```\n\nYou can combine charts and dashboards selection in a single command. For example, this command would download a chart and a dashboard:\n\n```bash\nlightdash download -c https://app.lightdash.cloud/the-url-to-my-first-saved-chart -d https://app.lightdash.cloud/the-url-to-my-dashboard\n```\n\n### Specify a download path\n\nUse `lightdash download -p` or `lightdash download --path` to specify a directory to download to\n\nBy default, `lightdash download` will create a new `lightdash` directory in your current working directory and write the content there. You can customize the directory that you write to using `lightdash download -p`. For example:\n\n```bash\nlightdash download -p /Users/katiehindson/lightdash/lightdash-analytics/\n```\n\nThis will create: `/Users/katiehindson/lightdash/lightdash-analytics/charts/` and `/Users/katiehindson/lightdash/lightdash-analytics/dashboards` and save the content to these new folders.\n\nYou can also use relative paths like:\n\n```bash\nlightdash download -p ../\n```\n\n### Make downloaded charts portable across projects\n\nUse `lightdash download --strip-pivot-series` to download charts whose series config is portable across projects.\n\nWhen a chart pivots on a dimension, its series config in the YAML hardcodes the pivot values present in the source project (for example, a `status` pivot might bake in `series` entries for `active`, `paused`, and `archived`). If you copy that YAML into another project that doesn't have the same pivot values, the upload either fails or renders with stale series.\n\n`--strip-pivot-series` rewrites cartesian chart series to reference only the underlying x/y fields, drops the hardcoded per-value entries, and collapses duplicates. The resulting YAML is safe to reuse as a template across projects:\n\n```bash\nlightdash download --strip-pivot-series\n```\n\nThis flag only affects regular charts. SQL charts and dashboards are downloaded unchanged.\n\n### Download an entire project\n\nUse `lightdash download --project <project UUID>` to download all content from a specific project\n\nRunning `lightdash download` will download all content from your current set project (set using `lightdash config set-project`). But, you can download content from another project using `lightdash download --project my-project-uuid`. For example:\n\n```bash\nlightdash download --project 21eef0b9-5bae-40f3-851e-9554588e71a6\n```\n\nYou can find a project's UUID from your Lightdash URL. For example, `https://app.lightdash.cloud/projects/123-project-uuid/`. Here, the project UUID here is `123-project-uuid` .",
                sourceUrl:
                    'https://docs.lightdash.com/workflow/content-as-code#lightdash-download',
                sourceLabel: 'lightdash download',
                sourceHash:
                    'a799e9f48d1eae353d75bd8dfc74a926e807cf128f4feb0df87e3dee9d4dd380',
            },
        ],
    },
    'create:ContentAsCode': {
        title: 'Understand content uploads',
        coveredScopes: ['create:ContentAsCode', 'manage:ContentAsCode'],
        sections: [
            {
                heading: 'Choosing a workflow',
                body: "There are two main approaches to working with content as code. You can mix and match these within your organization — for example, using disposable editing for quick changes and Git-managed dashboards for production-critical content.\n\n|  | Disposable editing | Git-managed dashboards |\n| --- | --- | --- |\n| **Source of truth** | Lightdash UI | Git repository |\n| **UI editing** | Users with edit access can edit | Restricted to view-only for managed content |\n| **Version history** | Lightdash's built-in history | Full Git audit trail with diffs and blame |\n| **Review process** | None required | Pull requests with approvals |\n| **Setup complexity** | Minimal — just the CLI | Requires CI/CD and space permissions |\n| **Best for** | Quick edits, AI-assisted changes, ad-hoc updates | Regulated environments, multi-instance deployments, teams that want strict change control |\n\n### Disposable editing (recommended)\n\nTreat the downloaded YAML as temporary working files: download, edit by hand or with an AI agent, upload, then discard the local copies instead of committing them. This keeps the Lightdash application as your source of truth while still giving you code-based, agent-assisted editing. See [Editing dashboards with agents](https://docs.lightdash.com/workflow/edit-dashboards-with-agents) for the full workflow.\n\n### Git-managed dashboards\n\nAn alternative approach where your **Git repository is the single source of truth** for charts and dashboards. All changes flow through version control, and the UI is read-only for managed content.\n\n#### When to use this workflow\n\n- You want a full audit trail of every dashboard change via Git history\n- You want to enforce review processes (pull requests, approvals) before changes reach production\n- You're comfortable with all edits happening in code rather than the UI\n- You want to validate dashboard changes in [preview environments](https://docs.lightdash.com/workflow/preview-projects) before merging\n- You're deploying the same content across multiple Lightdash instances\n\n#### Lock down the UI\n\nFor this workflow to succeed, you need to prevent ad-hoc UI edits from drifting out of sync with your repository. Use **space permissions** to enforce this:\n\n- Set the spaces containing your code-managed dashboards and charts to **view-only** for all non-admin roles\n- This ensures the YAML files in your repository are always the definitive version of the content\n\nYou don't have to manage everything this way. Organize code-managed content into specific spaces with restricted permissions, and leave other spaces open for UI editing.\n\n#### Making changes\n\nThe typical workflow for editing Git-managed dashboards:\n\n1. **Branch** — create a feature branch in your repository\n2. **Preview** — spin up a [preview environment](https://docs.lightdash.com/workflow/preview-projects) to test against\n3. **Edit the YAML files** — make changes to chart and dashboard files in the `lightdash/` directory. This is where AI coding assistants are especially useful — you can describe changes in natural language and have the assistant edit the YAML for you\n4. **Upload to the preview** — run `lightdash upload --force` to push your changes to the preview environment and verify everything looks right\n5. **Open a pull request** — once the changes look good in the preview, commit and open a PR for review\n6. **Merge and deploy** — on merge to your main branch, a CI job runs `lightdash deploy` and `lightdash upload --force` to push changes to production\n\n#### CI/CD setup\n\nTo fully automate this workflow, set up two CI jobs:\n\n- **Deploy on merge to main** — install the Lightdash CLI and dbt, then run `lightdash deploy` (to sync the semantic layer) followed by `lightdash upload --force` (to push chart and dashboard changes to production). You'll need `LIGHTDASH_API_KEY`, `LIGHTDASH_URL`, and `LIGHTDASH_PROJECT` configured as secrets in your CI environment.\n- **Preview environments on PRs** (optional) — automatically create a preview environment on every PR so reviewers can see dashboard changes before approving. On PR open or update, run `lightdash start-preview` and `lightdash upload --force`, then post the preview link as a PR comment. On PR close, run `lightdash stop-preview` to clean up.\n\nSee the [Lightdash CLI reference](https://docs.lightdash.com/workflow/cli/reference) for full details on available commands.",
                sourceUrl:
                    'https://docs.lightdash.com/workflow/content-as-code#choosing-a-workflow',
                sourceLabel: 'Choosing a workflow',
                sourceHash:
                    'a799e9f48d1eae353d75bd8dfc74a926e807cf128f4feb0df87e3dee9d4dd380',
            },
            {
                heading: 'lightdash upload',
                body: "`lightdash upload` updates any content as code to your project.\n\nFrom the [Lightdash CLI](https://docs.lightdash.com/workflow/cli/reference), you can use the command `lightdash upload` to upload any changes you've made to your charts or dashboards as code. To upload new charts that you've created as code to your Lightdash project, you need to run `lightdash upload --force`\n\n### Select specific items to upload\n\n##### Use `lightdash upload -c` or `lightdash upload --charts` to select specific charts\n\nFor example, if I only wanted to upload a specific saved chart as code, I would run the command:\n\n```bash\nlightdash upload -c my-saved-chart-slug\n```\n\nYou must specify the chart using the chart's SLUG.\n\n##### Use `lightdash upload -d` or `lightdash upload --dashboards` to select specific dashboards\n\nFor example, if I only wanted to upload a specific dashboard as code, I would run the command:\n\n```bash\nlightdash upload -d my-dashboard-slug\n```\n\nYou must specify the dashboard using the dashboard's SLUG.\n\n##### Use `--include-charts` to upload chart changes when uploading dashboards\n\nWhen uploading specific dashboards using `-d`, you can also include any chart changes referenced by those dashboards by adding the `--include-charts` flag:\n\n```bash\nlightdash upload -d my-dashboard-slug --include-charts\n```\n\nThis automatically includes charts that are referenced in the dashboard tiles, ensuring that both dashboard and chart changes are uploaded together.\n\n##### To select multiple charts or dashboards, add a space between the items\n\nFor example, this command would select two charts to upload:\n\n```bash\nlightdash upload -c my-saved-chart-1-slug my-saved-chart-2-slug\n```\n\n### Specify a path to upload from.\n\nUse `lightdash upload -p` or `lightdash upload --path` to specify a directory to upload from.\n\nBy default, `lightdash upload` will upload all items you have saved in the `lightdash` directory in your current working directory. You can customize the directory that you upload from using `lightdash upload -p`. For example:\n\n```bash\nlightdash upload -p /Users/katiehindson/lightdash/lightdash-analytics/\n```\n\nThis will upload all content from: `/Users/katiehindson/lightdash/lightdash-analytics/charts/` and `/Users/katiehindson/lightdash/lightdash-analytics/dashboards`.\n\nYou can also use relative paths like:\n\n```bash\nlightdash upload -p ../\n```\n\n### Specify a project to upload to\n\nUse `lightdash upload --project <project UUID>` to upload your content to a specific project.\n\nRunning `lightdash upload` will upload all content to your current set project (set using `lightdash config set-project`). But, you can upload content to another project using `lightdash upload --project my-project-uuid`. For example:\n\n```bash\nlightdash upload --project 21eef0b9-5bae-40f3-851e-9554588e71a6\n```\n\nYou can find a project's UUID from your Lightdash URL. For example, `https://app.lightdash.cloud/projects/123-project-uuid/`. Here, the project UUID here is `123-project-uuid` .\n\n##### Only content as code that you've made changes to will be uploaded\n\nFor example:\n\n- I have a chart that I've downloaded as code called `total-sales-worldwide.yml` in my `lightdash/` directory\n- I only make changes to that chart's .yml\n- I run `lightdash upload`\n- `total-sales-worldwide.yml` is the only file that gets uploaded because it's the only file that I made changes to\n\nFor example:\n\n- Katie has a chart that she's downloaded as code called `total-sales-worldwide.yml` in her `lightdash/` directory\n- She doesn't make any changes to the chart as code\n- Javi opens the same chart, `Total sales worldwide`, in the Lightdash application, makes some changes, and saves them\n- Now, Katie's `total-sales-worldwide.yml` and the `Total sales worldwide` chart in the application are different.\n- Katie runs `lightdash upload`\n- Katie's `total-sales-worldwide.yml` does **not** get uploaded because she made no changes to the chart as code\n- Javi's changes to the `Total sales worldwide` chart that he made in the Lightdash application are **not** overwritten (the version he created is what we see in the Lightdash application)\n\n##### Content that's been downloaded as code can still be updated in the Lightdash application\n\nFor example:\n\n- There is a Lightdash project called `Stellar Marketing`\n- Priyanka runs `lightdash download` and downloads all of the project's content as code, including a chart called `Total new clients`\n- Jake opens the `Total new clients` chart in the Lightdash application and makes some changes\n- Priyanka doesn't run `lightdash download`, so the `total-new-clients.yml` chart that Priyanka has as code is the old version of the chart, before Jake updated it.\n- Priyanka makes changes to `total-new-clients.yml` then runs `lightdash upload` and uploads her changes and overwrites the changes that Jake made in the Lightdash application.\n- Both Jake and Priyanka can update the same chart as code, or in the Lightdash application.\n\n### What download and upload include\n\nWhen you select a dashboard with `-d`, its dependencies follow it — automatically in some cases, behind a flag in others:\n\n| Step | Content | Behavior |\n| --- | --- | --- |\n| Download | Charts | Automatic |\n| Download | Virtual views | Automatic |\n| Download | Data apps | Automatic |\n| Download | Custom chart types | Automatic |\n| Upload | Charts | Requires `--include-charts` |\n| Upload | Virtual views | Requires `--include-virtual-views` |\n| Upload | Data apps | Automatic |\n| Upload | Custom chart types | Requires `--chart-types` |\n\nCharts that render with a [custom chart type](https://docs.lightdash.com/explore/chart-types/custom-project-charts) reference it by slug in their YAML, so downloading charts pulls their chart types into `lightdash/chart-types/` automatically. On upload the chart type must already exist in the target project — upload it with `--chart-types` first.\n\nSelecting virtual views, data apps, or custom chart types on their own, rather than through a dashboard, is opt-in on both commands — see [`lightdash download`](https://docs.lightdash.com/workflow/cli/reference#lightdash-download) and [`lightdash upload`](https://docs.lightdash.com/workflow/cli/reference#lightdash-upload) for those flags.",
                sourceUrl:
                    'https://docs.lightdash.com/workflow/content-as-code#lightdash-upload',
                sourceLabel: 'lightdash upload',
                sourceHash:
                    'a799e9f48d1eae353d75bd8dfc74a926e807cf128f4feb0df87e3dee9d4dd380',
            },
        ],
    },
    'manage:ContentAsCode': {
        title: 'Understand content uploads',
        coveredScopes: ['create:ContentAsCode', 'manage:ContentAsCode'],
        sections: [
            {
                heading: 'Choosing a workflow',
                body: "There are two main approaches to working with content as code. You can mix and match these within your organization — for example, using disposable editing for quick changes and Git-managed dashboards for production-critical content.\n\n|  | Disposable editing | Git-managed dashboards |\n| --- | --- | --- |\n| **Source of truth** | Lightdash UI | Git repository |\n| **UI editing** | Users with edit access can edit | Restricted to view-only for managed content |\n| **Version history** | Lightdash's built-in history | Full Git audit trail with diffs and blame |\n| **Review process** | None required | Pull requests with approvals |\n| **Setup complexity** | Minimal — just the CLI | Requires CI/CD and space permissions |\n| **Best for** | Quick edits, AI-assisted changes, ad-hoc updates | Regulated environments, multi-instance deployments, teams that want strict change control |\n\n### Disposable editing (recommended)\n\nTreat the downloaded YAML as temporary working files: download, edit by hand or with an AI agent, upload, then discard the local copies instead of committing them. This keeps the Lightdash application as your source of truth while still giving you code-based, agent-assisted editing. See [Editing dashboards with agents](https://docs.lightdash.com/workflow/edit-dashboards-with-agents) for the full workflow.\n\n### Git-managed dashboards\n\nAn alternative approach where your **Git repository is the single source of truth** for charts and dashboards. All changes flow through version control, and the UI is read-only for managed content.\n\n#### When to use this workflow\n\n- You want a full audit trail of every dashboard change via Git history\n- You want to enforce review processes (pull requests, approvals) before changes reach production\n- You're comfortable with all edits happening in code rather than the UI\n- You want to validate dashboard changes in [preview environments](https://docs.lightdash.com/workflow/preview-projects) before merging\n- You're deploying the same content across multiple Lightdash instances\n\n#### Lock down the UI\n\nFor this workflow to succeed, you need to prevent ad-hoc UI edits from drifting out of sync with your repository. Use **space permissions** to enforce this:\n\n- Set the spaces containing your code-managed dashboards and charts to **view-only** for all non-admin roles\n- This ensures the YAML files in your repository are always the definitive version of the content\n\nYou don't have to manage everything this way. Organize code-managed content into specific spaces with restricted permissions, and leave other spaces open for UI editing.\n\n#### Making changes\n\nThe typical workflow for editing Git-managed dashboards:\n\n1. **Branch** — create a feature branch in your repository\n2. **Preview** — spin up a [preview environment](https://docs.lightdash.com/workflow/preview-projects) to test against\n3. **Edit the YAML files** — make changes to chart and dashboard files in the `lightdash/` directory. This is where AI coding assistants are especially useful — you can describe changes in natural language and have the assistant edit the YAML for you\n4. **Upload to the preview** — run `lightdash upload --force` to push your changes to the preview environment and verify everything looks right\n5. **Open a pull request** — once the changes look good in the preview, commit and open a PR for review\n6. **Merge and deploy** — on merge to your main branch, a CI job runs `lightdash deploy` and `lightdash upload --force` to push changes to production\n\n#### CI/CD setup\n\nTo fully automate this workflow, set up two CI jobs:\n\n- **Deploy on merge to main** — install the Lightdash CLI and dbt, then run `lightdash deploy` (to sync the semantic layer) followed by `lightdash upload --force` (to push chart and dashboard changes to production). You'll need `LIGHTDASH_API_KEY`, `LIGHTDASH_URL`, and `LIGHTDASH_PROJECT` configured as secrets in your CI environment.\n- **Preview environments on PRs** (optional) — automatically create a preview environment on every PR so reviewers can see dashboard changes before approving. On PR open or update, run `lightdash start-preview` and `lightdash upload --force`, then post the preview link as a PR comment. On PR close, run `lightdash stop-preview` to clean up.\n\nSee the [Lightdash CLI reference](https://docs.lightdash.com/workflow/cli/reference) for full details on available commands.",
                sourceUrl:
                    'https://docs.lightdash.com/workflow/content-as-code#choosing-a-workflow',
                sourceLabel: 'Choosing a workflow',
                sourceHash:
                    'a799e9f48d1eae353d75bd8dfc74a926e807cf128f4feb0df87e3dee9d4dd380',
            },
            {
                heading: 'lightdash upload',
                body: "`lightdash upload` updates any content as code to your project.\n\nFrom the [Lightdash CLI](https://docs.lightdash.com/workflow/cli/reference), you can use the command `lightdash upload` to upload any changes you've made to your charts or dashboards as code. To upload new charts that you've created as code to your Lightdash project, you need to run `lightdash upload --force`\n\n### Select specific items to upload\n\n##### Use `lightdash upload -c` or `lightdash upload --charts` to select specific charts\n\nFor example, if I only wanted to upload a specific saved chart as code, I would run the command:\n\n```bash\nlightdash upload -c my-saved-chart-slug\n```\n\nYou must specify the chart using the chart's SLUG.\n\n##### Use `lightdash upload -d` or `lightdash upload --dashboards` to select specific dashboards\n\nFor example, if I only wanted to upload a specific dashboard as code, I would run the command:\n\n```bash\nlightdash upload -d my-dashboard-slug\n```\n\nYou must specify the dashboard using the dashboard's SLUG.\n\n##### Use `--include-charts` to upload chart changes when uploading dashboards\n\nWhen uploading specific dashboards using `-d`, you can also include any chart changes referenced by those dashboards by adding the `--include-charts` flag:\n\n```bash\nlightdash upload -d my-dashboard-slug --include-charts\n```\n\nThis automatically includes charts that are referenced in the dashboard tiles, ensuring that both dashboard and chart changes are uploaded together.\n\n##### To select multiple charts or dashboards, add a space between the items\n\nFor example, this command would select two charts to upload:\n\n```bash\nlightdash upload -c my-saved-chart-1-slug my-saved-chart-2-slug\n```\n\n### Specify a path to upload from.\n\nUse `lightdash upload -p` or `lightdash upload --path` to specify a directory to upload from.\n\nBy default, `lightdash upload` will upload all items you have saved in the `lightdash` directory in your current working directory. You can customize the directory that you upload from using `lightdash upload -p`. For example:\n\n```bash\nlightdash upload -p /Users/katiehindson/lightdash/lightdash-analytics/\n```\n\nThis will upload all content from: `/Users/katiehindson/lightdash/lightdash-analytics/charts/` and `/Users/katiehindson/lightdash/lightdash-analytics/dashboards`.\n\nYou can also use relative paths like:\n\n```bash\nlightdash upload -p ../\n```\n\n### Specify a project to upload to\n\nUse `lightdash upload --project <project UUID>` to upload your content to a specific project.\n\nRunning `lightdash upload` will upload all content to your current set project (set using `lightdash config set-project`). But, you can upload content to another project using `lightdash upload --project my-project-uuid`. For example:\n\n```bash\nlightdash upload --project 21eef0b9-5bae-40f3-851e-9554588e71a6\n```\n\nYou can find a project's UUID from your Lightdash URL. For example, `https://app.lightdash.cloud/projects/123-project-uuid/`. Here, the project UUID here is `123-project-uuid` .\n\n##### Only content as code that you've made changes to will be uploaded\n\nFor example:\n\n- I have a chart that I've downloaded as code called `total-sales-worldwide.yml` in my `lightdash/` directory\n- I only make changes to that chart's .yml\n- I run `lightdash upload`\n- `total-sales-worldwide.yml` is the only file that gets uploaded because it's the only file that I made changes to\n\nFor example:\n\n- Katie has a chart that she's downloaded as code called `total-sales-worldwide.yml` in her `lightdash/` directory\n- She doesn't make any changes to the chart as code\n- Javi opens the same chart, `Total sales worldwide`, in the Lightdash application, makes some changes, and saves them\n- Now, Katie's `total-sales-worldwide.yml` and the `Total sales worldwide` chart in the application are different.\n- Katie runs `lightdash upload`\n- Katie's `total-sales-worldwide.yml` does **not** get uploaded because she made no changes to the chart as code\n- Javi's changes to the `Total sales worldwide` chart that he made in the Lightdash application are **not** overwritten (the version he created is what we see in the Lightdash application)\n\n##### Content that's been downloaded as code can still be updated in the Lightdash application\n\nFor example:\n\n- There is a Lightdash project called `Stellar Marketing`\n- Priyanka runs `lightdash download` and downloads all of the project's content as code, including a chart called `Total new clients`\n- Jake opens the `Total new clients` chart in the Lightdash application and makes some changes\n- Priyanka doesn't run `lightdash download`, so the `total-new-clients.yml` chart that Priyanka has as code is the old version of the chart, before Jake updated it.\n- Priyanka makes changes to `total-new-clients.yml` then runs `lightdash upload` and uploads her changes and overwrites the changes that Jake made in the Lightdash application.\n- Both Jake and Priyanka can update the same chart as code, or in the Lightdash application.\n\n### What download and upload include\n\nWhen you select a dashboard with `-d`, its dependencies follow it — automatically in some cases, behind a flag in others:\n\n| Step | Content | Behavior |\n| --- | --- | --- |\n| Download | Charts | Automatic |\n| Download | Virtual views | Automatic |\n| Download | Data apps | Automatic |\n| Download | Custom chart types | Automatic |\n| Upload | Charts | Requires `--include-charts` |\n| Upload | Virtual views | Requires `--include-virtual-views` |\n| Upload | Data apps | Automatic |\n| Upload | Custom chart types | Requires `--chart-types` |\n\nCharts that render with a [custom chart type](https://docs.lightdash.com/explore/chart-types/custom-project-charts) reference it by slug in their YAML, so downloading charts pulls their chart types into `lightdash/chart-types/` automatically. On upload the chart type must already exist in the target project — upload it with `--chart-types` first.\n\nSelecting virtual views, data apps, or custom chart types on their own, rather than through a dashboard, is opt-in on both commands — see [`lightdash download`](https://docs.lightdash.com/workflow/cli/reference#lightdash-download) and [`lightdash upload`](https://docs.lightdash.com/workflow/cli/reference#lightdash-upload) for those flags.",
                sourceUrl:
                    'https://docs.lightdash.com/workflow/content-as-code#lightdash-upload',
                sourceLabel: 'lightdash upload',
                sourceHash:
                    'a799e9f48d1eae353d75bd8dfc74a926e807cf128f4feb0df87e3dee9d4dd380',
            },
        ],
    },
    'promote:SavedChart': {
        title: 'Understand chart promotion',
        coveredScopes: ['promote:SavedChart'],
        sections: [
            {
                heading: 'How promoting works',
                body: 'If you are promoting a chart, from a `development` project to a `production` project, this will happen:\n\n* If the chart exists in both the `development` project and the `production` project, the chart in `production` will be updated with the changes from `development`. You can always revert this chart to a previous version using [version history](https://docs.lightdash.com/explore/version-history). Lightdash matches charts based on the name used when you first created them. Even if you change the names later, the two charts will still be linked.\n* If the chart is new, we will replicate the `development` chart into the `production` project. We will also create a new space if a space does not exist with the same name.',
                sourceUrl:
                    'https://docs.lightdash.com/explore/promote-content#how-promoting-works',
                sourceLabel: 'How promoting works',
                sourceHash:
                    '02f58887e44880c5a1fd21011297506812df25f5740b27092e8f149792d9bac4',
            },
            {
                heading: 'Configure upstream project',
                body: 'Before you can start promoting content, you need to configure your upstream project. To do this, on your `development` project go to settings > Data ops.\n\nSelect the project where you want to copy the content to.',
                sourceUrl:
                    'https://docs.lightdash.com/explore/promote-content#configure-upstream-project',
                sourceLabel: 'Configure upstream project',
                sourceHash:
                    '02f58887e44880c5a1fd21011297506812df25f5740b27092e8f149792d9bac4',
            },
            {
                heading: 'Promote charts',
                body: "**You must be a `developer` and have access to the chart and space in both the `development project` and the `upstream project`.**\n  \n  If the chart is in a space that doesn't exist in the `upstream project`, then this space will be created with the same user access and the content will be put in this space. If the chart is in a space that exists in the `upstream project`, the access to this space will not be updated.\n\nYou can promote charts from the `chart` in view mode or from any listing (like home page or all charts), click on the `...` button and then select `promote chart`.\n\nOnce the chart is promoted, you can click on the `success` banner to open a new tab into this chart in the `production project`",
                sourceUrl:
                    'https://docs.lightdash.com/explore/promote-content#promote-charts',
                sourceLabel: 'Promote charts',
                sourceHash:
                    '02f58887e44880c5a1fd21011297506812df25f5740b27092e8f149792d9bac4',
            },
        ],
    },
    'promote:Dashboard': {
        title: 'Understand dashboard promotion',
        coveredScopes: ['promote:Dashboard'],
        sections: [
            {
                heading: 'How promoting works',
                body: 'If you are promoting a chart, from a `development` project to a `production` project, this will happen:\n\n* If the chart exists in both the `development` project and the `production` project, the chart in `production` will be updated with the changes from `development`. You can always revert this chart to a previous version using [version history](https://docs.lightdash.com/explore/version-history). Lightdash matches charts based on the name used when you first created them. Even if you change the names later, the two charts will still be linked.\n* If the chart is new, we will replicate the `development` chart into the `production` project. We will also create a new space if a space does not exist with the same name.',
                sourceUrl:
                    'https://docs.lightdash.com/explore/promote-content#how-promoting-works',
                sourceLabel: 'How promoting works',
                sourceHash:
                    '02f58887e44880c5a1fd21011297506812df25f5740b27092e8f149792d9bac4',
            },
            {
                heading: 'Configure upstream project',
                body: 'Before you can start promoting content, you need to configure your upstream project. To do this, on your `development` project go to settings > Data ops.\n\nSelect the project where you want to copy the content to.',
                sourceUrl:
                    'https://docs.lightdash.com/explore/promote-content#configure-upstream-project',
                sourceLabel: 'Configure upstream project',
                sourceHash:
                    '02f58887e44880c5a1fd21011297506812df25f5740b27092e8f149792d9bac4',
            },
            {
                heading: 'Promote dashboards',
                body: "**You must be a `developer` and have access to the dashboard and space in both the `development project` and the `upstream project` as well as have access to all the charts in the dashboard.**\n  \nIf the dashboard is in a space that doesn't exist in the `upstream project`, then this space will be created with the same user access and the content will be put in this space. If the dashboard is in a space that exists in the `upstream project`, the access to this space will not be updated.\n\nYou can promote dashboards from the `dashboard` in view mode or from any listing (like home page or all dashboards), click on the `...` button and then select `promote dashboard`.\n\nThis will promote the dashboard to the `upstream` project as well as all the charts in this dashboard (for both charts within spaces and charts within this dashboard), any embedded [data app](https://docs.lightdash.com/data-apps) tiles, and all other non-chart tiles like markdown.\n\nIf the dashboard, charts or data apps are in a space that doesn't exist in the upstream project, then these spaces will be created and the content will be put in these spaces.\n\nOnce the dashboard is promoted, you can click on the `success` banner to open a new tab into this dashboard in the `production project`.",
                sourceUrl:
                    'https://docs.lightdash.com/explore/promote-content#promote-dashboards',
                sourceLabel: 'Promote dashboards',
                sourceHash:
                    '02f58887e44880c5a1fd21011297506812df25f5740b27092e8f149792d9bac4',
            },
        ],
    },
    'manage:Validation': {
        title: 'Understand content validation',
        coveredScopes: ['manage:Validation'],
        sections: [
            {
                heading: 'How can I validate my content?',
                body: 'Your project is validated any time the content validator is run. The content validator will run when:\n\n* a user hits `Refresh dbt` in the app\n* the command `lightdash deploy` is run on the [Lightdash CLI](https://docs.lightdash.com/workflow/cli/reference#lightdash-deploy) (you can read more about [automatically deploying with GitHub Actions](https://docs.lightdash.com/workflow/set-up-ci-cd#deploy-changes-to-lightdash))\n* you update your project settings and hit `Test and compile`.\n* you hit `Run validation` directly inside the content validator dashboard\n* you run `lightdash validate` [from the CLI](https://docs.lightdash.com/workflow/cli/validate)',
                sourceUrl:
                    'https://docs.lightdash.com/workflow/validating-your-content#how-can-i-validate-my-content',
                sourceLabel: 'How can I validate my content?',
                sourceHash:
                    '93bac30d74182f1d24cf2627c8d10d3883af8faef75c7eebbec8e1995d8ba76e',
            },
            {
                heading: 'What content is included in the validation?',
                body: "The validator will show you any errors caused by metrics or dimensions which no longer exist, have been renamed, or have invalid definitions. The validator does not show errors caused by invalid SQL at run time (e.g. invalid SQL syntax, division by 0, trying to perform numeric calculations on a string value type).\n\nHere are some examples of errors that would appear in your content validator:\n\n* Renaming a metric from `total_revenue` to `sum_revenue`. The old metric name is used in a chart, so it breaks the chart.\n* Deleting a dimension `is_premium_user` which is referenced in a metric's custom SQL definition.\n* Deleting a dimension `is_premium_user` which is used as a filter on a dashboard.\n\nThe content types included in the validator dashboard are:\n\n* **Tables:** errors in tables are caused when dimensions or metrics that have been deleted or renamed but are still referenced in other places in the table.\n* **Charts:** errors in charts are caused when the results table or filters reference a metric or dimension which no longer exists.\n* **Dashboards:** errors in dashboards are caused when a chart is broken in the dashboard or a filter references a metric or dimension which no longer exists.",
                sourceUrl:
                    'https://docs.lightdash.com/workflow/validating-your-content#what-content-is-included-in-the-validation',
                sourceLabel: 'What content is included in the validation?',
                sourceHash:
                    '93bac30d74182f1d24cf2627c8d10d3883af8faef75c7eebbec8e1995d8ba76e',
            },
            {
                heading: 'How to fix errors',
                body: 'There are a few ways to fix errors that appear in the validator:\n\n**Table errors** require you to check your YAML and fix orphaned references. This can be done with find and replace in your code editor. \n\n**Chart and dashboard errors** can be resolved by opening the content in Lightdash and updating the field references, but this usually means you have to rebuild your chart(s). The preferred method to resolve errors is to [rename fields in the app](https://docs.lightdash.com/workflow/rename-models-and-fields#rename-in-lightdash) or use `lightdash rename` [in the CLI](https://docs.lightdash.com/workflow/rename-models-and-fields#rename-in-the-cli). You can also find and replace references in charts and dasboards using [dashboards as code](https://docs.lightdash.com/workflow/content-as-code).',
                sourceUrl:
                    'https://docs.lightdash.com/workflow/validating-your-content#how-to-fix-errors',
                sourceLabel: 'How to fix errors',
                sourceHash:
                    '93bac30d74182f1d24cf2627c8d10d3883af8faef75c7eebbec8e1995d8ba76e',
            },
            {
                heading: 'How to dismiss errors',
                body: 'You can dismiss errors from validation by clicking on the "x" button that appears when you hover over a row on the validation table.\n\nDismissed validation errors are applied to everyone. So, if you dismiss an error, it will be removed from everyone else\'s validation results as well as yours. The errors you dismissed will reappear again if you run another validation and the issue hasn\'t been fixed yet.',
                sourceUrl:
                    'https://docs.lightdash.com/workflow/validating-your-content#how-to-dismiss-errors',
                sourceLabel: 'How to dismiss errors',
                sourceHash:
                    '93bac30d74182f1d24cf2627c8d10d3883af8faef75c7eebbec8e1995d8ba76e',
            },
        ],
    },
    'view:EmbedDashboardFilters': {
        title: 'Understand embedded dashboard filters',
        coveredScopes: [
            'view:EmbedDashboardFilters',
            'view:EmbedDashboardFilterAddition',
        ],
        sections: [
            {
                heading: 'Dashboard filters interactivity',
                body: "Controls whether users can interact with dashboard filters.\n\n```typescript\ndashboardFiltersInteractivity?: {\n  enabled: 'all' | 'some' | 'none',\n  allowedFilters?: string[],  // Filter UUIDs, required if enabled: 'some'\n  hidden?: boolean,           // Hide filter UI but keep filters active\n  canAddFilters?: boolean,    // Let viewers add temporary session-only filters\n}\n```\n\n**Options:**\n\n- `enabled: 'all'` - All dashboard filters are visible and interactive\n- `enabled: 'some'` - Only filters listed in `allowedFilters` are interactive\n- `enabled: 'none'` - Filters are applied but not visible or editable\n- `hidden: true` - Filters are configurable at runtime, but UI is hidden (works with 'all' or 'some')\n- `canAddFilters: true` - Render an **Add filter** button so viewers can add temporary filters over any filterable field in the dashboard's explores. Only effective when filter interactivity is enabled (`enabled: 'all'`, or `enabled: 'some'` with a non-empty `allowedFilters`). Viewer-added filters live in session state and the temp-filter deep-link parameter — a fresh embed URL starts clean. JWTs without this field behave exactly as before (button hidden). Metric filters in the picker still require the `metric-dashboard-filters` feature flag on the org.\n\nEmbed overrides targeting a [locked dashboard filter](https://docs.lightdash.com/explore/dashboards/filter#locking-dashboard-filters) are ignored, and the dashboard's saved locked value is used instead. Use a locked filter when you need to guarantee an embedded dashboard always runs with a specific value — for example, scoping every query to the customer who owns the embed session.",
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#dashboard-filters-interactivity',
                sourceLabel: 'Dashboard filters interactivity',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedDashboardFilterAddition': {
        title: 'Understand embedded dashboard filters',
        coveredScopes: [
            'view:EmbedDashboardFilters',
            'view:EmbedDashboardFilterAddition',
        ],
        sections: [
            {
                heading: 'Dashboard filters interactivity',
                body: "Controls whether users can interact with dashboard filters.\n\n```typescript\ndashboardFiltersInteractivity?: {\n  enabled: 'all' | 'some' | 'none',\n  allowedFilters?: string[],  // Filter UUIDs, required if enabled: 'some'\n  hidden?: boolean,           // Hide filter UI but keep filters active\n  canAddFilters?: boolean,    // Let viewers add temporary session-only filters\n}\n```\n\n**Options:**\n\n- `enabled: 'all'` - All dashboard filters are visible and interactive\n- `enabled: 'some'` - Only filters listed in `allowedFilters` are interactive\n- `enabled: 'none'` - Filters are applied but not visible or editable\n- `hidden: true` - Filters are configurable at runtime, but UI is hidden (works with 'all' or 'some')\n- `canAddFilters: true` - Render an **Add filter** button so viewers can add temporary filters over any filterable field in the dashboard's explores. Only effective when filter interactivity is enabled (`enabled: 'all'`, or `enabled: 'some'` with a non-empty `allowedFilters`). Viewer-added filters live in session state and the temp-filter deep-link parameter — a fresh embed URL starts clean. JWTs without this field behave exactly as before (button hidden). Metric filters in the picker still require the `metric-dashboard-filters` feature flag on the org.\n\nEmbed overrides targeting a [locked dashboard filter](https://docs.lightdash.com/explore/dashboards/filter#locking-dashboard-filters) are ignored, and the dashboard's saved locked value is used instead. Use a locked filter when you need to guarantee an embedded dashboard always runs with a specific value — for example, scoping every query to the customer who owns the embed session.",
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#dashboard-filters-interactivity',
                sourceLabel: 'Dashboard filters interactivity',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedDashboardParameters': {
        title: 'Understand embedded parameters',
        coveredScopes: ['view:EmbedDashboardParameters'],
        sections: [
            {
                heading: 'Parameter interactivity',
                body: 'Controls whether users can modify dashboard parameters.\n\n```typescript\nparameterInteractivity?: {\n  enabled: boolean,\n}\n```\n\nWhen enabled, users can change parameter values in the dashboard UI.',
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#parameter-interactivity',
                sourceLabel: 'Parameter interactivity',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedCsvExport': {
        title: 'Understand embedded exports',
        coveredScopes: [
            'view:EmbedCsvExport',
            'view:EmbedImageExport',
            'view:EmbedPagePdfExport',
        ],
        sections: [
            {
                heading: 'Export options',
                body: 'Control what users can export from embedded content.\n\n```typescript\n{\n  canExportCsv?: boolean,        // Download chart data as CSV files\n  canExportImages?: boolean,     // Download charts as PNG images\n  canExportPagePdf?: boolean,    // Download entire dashboard page as PDF (dashboards only)\n}\n```\n\n**CSV Export:**\n- Enables "Download CSV" in chart tile menus\n- Each chart can be exported individually\n- Exports the data shown in the visualization\n\n**Image Export:**\n- Enables "Download as image" in chart tile menus\n- Exports charts as PNG files\n- Captures current chart state\n\n**PDF Export (dashboards only):**\n- Enables print icon in dashboard header\n- Exports entire dashboard page as PDF\n- Includes all visible tiles',
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#export-options',
                sourceLabel: 'Export options',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedImageExport': {
        title: 'Understand embedded exports',
        coveredScopes: [
            'view:EmbedCsvExport',
            'view:EmbedImageExport',
            'view:EmbedPagePdfExport',
        ],
        sections: [
            {
                heading: 'Export options',
                body: 'Control what users can export from embedded content.\n\n```typescript\n{\n  canExportCsv?: boolean,        // Download chart data as CSV files\n  canExportImages?: boolean,     // Download charts as PNG images\n  canExportPagePdf?: boolean,    // Download entire dashboard page as PDF (dashboards only)\n}\n```\n\n**CSV Export:**\n- Enables "Download CSV" in chart tile menus\n- Each chart can be exported individually\n- Exports the data shown in the visualization\n\n**Image Export:**\n- Enables "Download as image" in chart tile menus\n- Exports charts as PNG files\n- Captures current chart state\n\n**PDF Export (dashboards only):**\n- Enables print icon in dashboard header\n- Exports entire dashboard page as PDF\n- Includes all visible tiles',
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#export-options',
                sourceLabel: 'Export options',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedPagePdfExport': {
        title: 'Understand embedded exports',
        coveredScopes: [
            'view:EmbedCsvExport',
            'view:EmbedImageExport',
            'view:EmbedPagePdfExport',
        ],
        sections: [
            {
                heading: 'Export options',
                body: 'Control what users can export from embedded content.\n\n```typescript\n{\n  canExportCsv?: boolean,        // Download chart data as CSV files\n  canExportImages?: boolean,     // Download charts as PNG images\n  canExportPagePdf?: boolean,    // Download entire dashboard page as PDF (dashboards only)\n}\n```\n\n**CSV Export:**\n- Enables "Download CSV" in chart tile menus\n- Each chart can be exported individually\n- Exports the data shown in the visualization\n\n**Image Export:**\n- Enables "Download as image" in chart tile menus\n- Exports charts as PNG files\n- Captures current chart state\n\n**PDF Export (dashboards only):**\n- Enables print icon in dashboard header\n- Exports entire dashboard page as PDF\n- Includes all visible tiles',
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#export-options',
                sourceLabel: 'Export options',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedDashboardCsvExport': {
        title: 'Understand exporting all embedded dashboard tiles',
        coveredScopes: ['view:EmbedDashboardCsvExport'],
        sections: [
            {
                heading: 'Export all dashboard tiles',
                body: "Set `content.canExportDashboardCsv: true` to show **Export all tiles** in the embedded dashboard header. Viewers can choose **Export all as .csv (.zip)** or **Export all as .xlsx (.zip)** to download the dashboard's chart tiles in a ZIP archive.\n\nThis option is off by default and independent of `canExportCsv`, which controls per-chart CSV downloads. It applies only to the dashboard identified by the embed token. In scope-based embed permissions, the corresponding scope is `view:EmbedDashboardCsvExport`.\n\nExports use formatted values, each chart's table row limit, and pivoted results. They apply the current dashboard filters, date zoom, and parameter values. The embedded export menu uses these defaults without an export-options dialog.",
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#export-all-dashboard-tiles',
                sourceLabel: 'Export all dashboard tiles',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedDateZoom': {
        title: 'Understand embedded date zoom',
        coveredScopes: ['view:EmbedDateZoom'],
        sections: [
            {
                heading: 'Date zoom',
                body: "Allows users to zoom into time-series data by changing granularity.\n\n```typescript\ncanDateZoom?: boolean\n```\n\nWhen enabled, the embed renders the dashboard's configured date zoom controls (the Default zoom plus any named controls), letting users change the date granularity of charts on the dashboard. See the [Date zoom guide](https://docs.lightdash.com/explore/dashboards/date-zoom) for complete documentation on this feature.",
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#date-zoom',
                sourceLabel: 'Date zoom',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedExplore': {
        title: 'Understand embedded exploration',
        coveredScopes: ['view:EmbedExplore'],
        sections: [
            {
                heading: 'Explore from here',
                body: 'Enables navigation from dashboard charts to the explore view.\n\n```typescript\ncanExplore?: boolean\n```\n\nWhen enabled, users see "Explore from here" in chart tile menus. This opens the full query builder with the chart\'s configuration pre-loaded.\n\nUsers can:\n- Modify dimensions and metrics\n- Apply different filters\n- Change chart types\n- Run custom queries\n\nThe `canExplore` option alone does not allow users to save charts, share results, or view SQL. To let users save new charts from Explore, configure a [writeActions claim](https://docs.lightdash.com/embed/reference#write-actions).',
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#explore-from-here',
                sourceLabel: 'Explore from here',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedUnderlyingData': {
        title: 'Understand embedded underlying data',
        coveredScopes: ['view:EmbedUnderlyingData'],
        sections: [
            {
                heading: 'View underlying data',
                body: 'Allows users to view the raw data table behind visualizations.\n\n```typescript\ncanViewUnderlyingData?: boolean\n```\n\nWhen enabled, users can click on charts to open a modal showing the underlying data table. Data cannot be exported separately (use `canExportCsv` for that).',
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#view-underlying-data',
                sourceLabel: 'View underlying data',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedDataApps': {
        title: 'Understand embedded data apps',
        coveredScopes: ['view:EmbedDataApps'],
        sections: [
            {
                heading: 'View data apps',
                body: 'Allows [data app](https://docs.lightdash.com/data-apps) tiles on an embedded dashboard to render and run their metric queries.\n\n```typescript\ncanViewDataApps?: boolean\n```\n\nData app tiles run arbitrary metric queries against your semantic layer, so they need broader access than a standard chart tile. Enabling `canViewDataApps` grants the embed JWT the additional permissions a data app needs to mint a preview token and execute its queries. User attributes and SQL filters on the JWT still apply, so row-level access controls are enforced inside the data app exactly as they are on chart tiles.\n\nWhen this option is off (the default), data app tiles on the dashboard render as a placeholder and no queries run. Turn it on when you trust the embed audience to see the data the app can request and you want the tile to behave the same as it does in Lightdash.',
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#view-data-apps',
                sourceLabel: 'View data apps',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:EmbedAiAgent': {
        title: 'Understand embedded AI agents',
        coveredScopes: ['view:EmbedAiAgent'],
        sections: [
            {
                heading: 'AI agent token',
                body: "For embedding a Lightdash [AI agent](https://docs.lightdash.com/agents) so users can chat with their data from inside your app. See [Embedding AI agents](https://docs.lightdash.com/embed/embed-ai-agents) for the full walkthrough.\n\n```typescript\n{\n  content: {\n    type: 'aiAgent',\n\n    // Agent the embed is allowed to use (required)\n    agentUuid: string,\n\n    // Project identifier (optional)\n    projectUuid?: string,\n  },\n\n  // Required: AI agent embeds must include writeActions\n  writeActions: {\n    spaceUuid: string,                  // Space the agent reads/writes content from\n    serviceAccountUserUuid?: string,    // Use a service account as the actor\n    userUuid?: string,                  // Or use an existing Lightdash user as the actor\n  },\n\n  // Optional: row-level filtering for the embedded viewer\n  userAttributes?: {\n    [attributeName: string]: string,\n  },\n\n  // Optional: user information surfaced in audit/analytics\n  user?: {\n    externalId?: string,\n    email?: string,\n  },\n}\n```\n\nAI agent tokens are scoped to a single agent. A token issued for one `agentUuid` cannot be used to access another agent, and dashboard or chart tokens are rejected on AI agent routes. The agent can only read dashboards and saved charts from `writeActions.spaceUuid`, and saves new charts back into that same space.\n\n**Example:**\n\n```javascript\nimport jwt from 'jsonwebtoken';\n\nconst token = jwt.sign({\n  content: {\n    type: 'aiAgent',\n    projectUuid: 'your-project-uuid',\n    agentUuid: 'your-agent-uuid',\n  },\n  writeActions: {\n    serviceAccountUserUuid: 'service-account-user-uuid',\n    spaceUuid: 'destination-space-uuid',\n  },\n  userAttributes: {\n    tenant_id: 'tenant-abc',\n  },\n  user: {\n    email: 'customer@example.com',\n  },\n}, SECRET, { expiresIn: '1h' });\n```",
                sourceUrl:
                    'https://docs.lightdash.com/embed/reference#ai-agent-token',
                sourceLabel: 'AI agent token',
                sourceHash:
                    '281461b0868e252e6d9170fae3c4eebede3686df13777c165502320070d8412b',
            },
        ],
    },
    'view:Analytics': {
        title: 'Understand usage analytics',
        coveredScopes: ['view:Analytics'],
        sections: [
            {
                heading: 'Usage analytics dashboards',
                body: "Each project has usage analytics dashboards created by Lightdash giving you an overview of your project's content and user activity.\n\nTo see your usage analytics dashboards for a project, just click on the `settings` icon, `project settings`, then `usage analytics`.\n\nOr you can also use our [search bar](https://docs.lightdash.com/explore/search) to get direct access to the different analytics dashboards by typing the name of the dashboard (eg: User activity)\n\n### User Activity dashboard\n\nThis dashboard gives you an overview of the users in your project and the activity of your users.\n\nHere's an overview of the fields used in the dashboard:\n\n- **Number of users**: the total number of users that have access to the project.\n- **Number of viewers**: the number of users with the `viewer` role that have access to the project.\n- **Number of editors**: the number of users with the `editor` role that have access to the project.\n- **Number of admins**: the number of users with the `admin` role that have access to the project.\n- **% of weekly querying users**: the % of users which have run at least one query in the project in the last 7 days (out of all users in your project). Queries include viewing existing charts and dashboards.\n- **Number of weekly querying users**: the number of users which have run at least one query in the project in the last 7 days.\n- **Weekly average number of queries per user**: the rolling 7 day average number of queries that each user is running in your project.\n- **Users that have run the most queries in the last 7 days**: a list of the users that have run the most queries in your project in the last 7 days.\n- **Users that have updated the most charts in the last 7 days**: a list of users that have updated (including created) the most charts in the project in the last 7 days.\n- **Users that have not run a query in the last 90 days**: a list of users that have not run a query in the project in the last 90 days. This includes viewing charts and dashboards.\n\n#### Extended usage analytics\n\nSelf-hosted instances can set the `EXTENDED_USAGE_ANALYTICS=true` environment variable to add two extra tables to the User Activity dashboard:\n\n- **Dashboard views (top 20)**: ranks dashboards in the project by total view count.\n- **Chart views (top 20)**: ranks charts in the project by total view count.",
                sourceUrl:
                    'https://docs.lightdash.com/workspace-admin/usage-analytics#usage-analytics-dashboards',
                sourceLabel: 'Usage analytics dashboards',
                sourceHash:
                    '575581b6b070352155d10087e1fa4fbd166a6a5dc144c1db1c58c61f41bc80cb',
            },
        ],
    },
    'view:AiAgentDocument': {
        title: 'Understand agent knowledge documents',
        coveredScopes: ['view:AiAgentDocument'],
        sections: [
            {
                heading: 'How they work',
                body: "When you upload a document, Lightdash reads it and writes a short summary of what it's about — what it covers, which terms it defines, which explores it relates to, and when the agent should consult it. The agent always sees this summary, so it knows the document is available and what's in it. By default, it only reads the full content when a question actually calls for it (**on-demand retrieval**), which keeps conversations fast.\n\nA few things worth knowing:\n\n- **The agent decides when to open a document.** If your document is never being used, the summary probably isn't specific enough about what it's for. Renaming the document or making its purpose clearer in the content usually fixes it.\n- **Each document gets a relevance rating against your project.** After uploading, check the relevance card. If a document is rated low or unrelated, the agent has been told not to rely on it for data questions — you'll want to revise it, or scope it to a different agent where it's more relevant.\n- **Documents are listed per agent.** The documents table only shows the documents this agent can actually use — organization-level documents (available to every agent) plus any documents specifically granted to this agent. Uploading a document from an agent's settings scopes it to that agent by default.",
                sourceUrl:
                    'https://docs.lightdash.com/agents/effective-analytics-with-agents#how-they-work',
                sourceLabel: 'How they work',
                sourceHash:
                    '1da989b6102fe53752d02b9dd0a45223151230c977555ea1232880433abeb5ce',
            },
            {
                heading: 'Open a document',
                body: "In the agent's knowledge documents list, select the document and click the **View and edit document** (eye) icon to open the fullscreen viewer. Read the document there, or click **Download** to save a copy of the current file.",
                sourceUrl:
                    'https://docs.lightdash.com/agents/effective-analytics-with-agents#open-a-document',
                sourceLabel: 'Open a document',
                sourceHash:
                    '1da989b6102fe53752d02b9dd0a45223151230c977555ea1232880433abeb5ce',
            },
        ],
    },
    'manage:AiAgentDocument': {
        title: 'Understand knowledge document maintenance',
        coveredScopes: ['manage:AiAgentDocument'],
        sections: [
            {
                heading: 'How they work',
                body: "When you upload a document, Lightdash reads it and writes a short summary of what it's about — what it covers, which terms it defines, which explores it relates to, and when the agent should consult it. The agent always sees this summary, so it knows the document is available and what's in it. By default, it only reads the full content when a question actually calls for it (**on-demand retrieval**), which keeps conversations fast.\n\nA few things worth knowing:\n\n- **The agent decides when to open a document.** If your document is never being used, the summary probably isn't specific enough about what it's for. Renaming the document or making its purpose clearer in the content usually fixes it.\n- **Each document gets a relevance rating against your project.** After uploading, check the relevance card. If a document is rated low or unrelated, the agent has been told not to rely on it for data questions — you'll want to revise it, or scope it to a different agent where it's more relevant.\n- **Documents are listed per agent.** The documents table only shows the documents this agent can actually use — organization-level documents (available to every agent) plus any documents specifically granted to this agent. Uploading a document from an agent's settings scopes it to that agent by default.",
                sourceUrl:
                    'https://docs.lightdash.com/agents/effective-analytics-with-agents#how-they-work',
                sourceLabel: 'How they work',
                sourceHash:
                    '1da989b6102fe53752d02b9dd0a45223151230c977555ea1232880433abeb5ce',
            },
            {
                heading: 'Always include in context',
                body: 'For documents the agent should apply to *every* question — not just the ones where the summary happens to match — flip the **Always include in context** toggle in the document\'s settings panel.\n\n- **On demand (default).** The agent sees only the summary and reads the full document when the question calls for it. Best for large or occasionally-relevant references.\n- **Always included.** The full document is embedded into the agent\'s system prompt on every request. Best for short, high-value context that shapes how *all* answers should be written — for example, a one-paragraph definition of "active customer" that every metric answer should honor.\n\nThe documents table shows an **Always included** or **On demand** status chip per document so you can see at a glance which documents will be in every prompt.\n\nAlways-included documents make every prompt larger, which uses more tokens and can slow responses. The toggle description surfaces this trade-off in the UI. Keep always-included content short and reserve the toggle for context that genuinely matters on every turn — leave everything else on on-demand retrieval.\n\nBecause "always include" changes every future response, switching a document *to* always-included asks for confirmation. Switching back to on-demand retrieval takes effect immediately. Deleting a document also asks for confirmation.',
                sourceUrl:
                    'https://docs.lightdash.com/agents/effective-analytics-with-agents#always-include-in-context',
                sourceLabel: 'Always include in context',
                sourceHash:
                    '1da989b6102fe53752d02b9dd0a45223151230c977555ea1232880433abeb5ce',
            },
            {
                heading: 'View, edit, or download a document',
                body: "#### Open a document\n\nIn the agent's knowledge documents list, select the document and click the **View and edit document** (eye) icon to open the fullscreen viewer. Read the document there, or click **Download** to save a copy of the current file.\n\n#### Edit a document\n\nFrom the document viewer, click **Edit** to change the document. You don't need to delete and re-upload it to fix a typo, refresh guidance, or update frontmatter.\n\nYou can edit the document's name and content. Markdown documents open in an editor with a live preview, while plain-text documents open in a monospace text area. YAML frontmatter remains in the raw Markdown source but isn't shown in the preview.\n\n- **Unsaved changes.** Closing the editor with pending changes asks for confirmation. Use **Cancel** to discard changes and return to the viewer.\n- **Quotas.** The 20KB per-document and 5MB organization limits also apply to edits. The editor shows the document's size and disables **Save** when the content is over the limit or the name is empty.\n- **Summary and context.** When the content changes, Lightdash regenerates the document summary. Saved content is available to the agent on its next message, including for documents that are always included in context.",
                sourceUrl:
                    'https://docs.lightdash.com/agents/effective-analytics-with-agents#view-edit-or-download-a-document',
                sourceLabel: 'View, edit, or download a document',
                sourceHash:
                    '1da989b6102fe53752d02b9dd0a45223151230c977555ea1232880433abeb5ce',
            },
        ],
    },
};
