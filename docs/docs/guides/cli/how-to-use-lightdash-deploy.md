# Using `lightdash deploy` to sync the changes in your dbt project to Lightdash

If you've made some changes to your dbt project and you'd like to make them available in your Lightdash project, you can easily do this using the `lightadsh deploy` command in the Lightdash CLI tool.

## Merge your changes to `main` or `master`

If you're working with a version controlled project, and you made your changes on a branch, you'll just want to make sure to merge your changes into the branch you've connected your Lightdash project to (e.g. `main` or `master`).

Once they've been merged or if you're just working off of `main` (_rebel_ 😏), you can deploy your changes.

## Deploy your changes to your Lightdash project

To deploy your changes, you'll want run these commands in your terminal:

```shell
git checkout main # checkout main or master - or whatever your production branch name is
git pull
lightdash deploy # --target prod. If you use developer profiles in your dbt project, you might need this flag. See below.
```

This will deploy the changes in your dbt project to the Lightdash project you set up on your CLI tool earlier.

:::info

**Note:** Lightdash's deploy commnd will deploy using your **default dbt target** unless you specify to use a different target. For example, if you've set up a developer profile where it targets a dev dataset (like `dbt_khindson.my_model_names`), then you'll need to pass the production target in your `lightdash deploy` command. Something like: `lightdash deploy --target prod`.

:::

And voilà! Once it's completed click the URL to head straight to your project where your changes will be ready to be explored.
