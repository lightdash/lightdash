# Snowflake Project Template

This is a template Lightdash project for Snowflake.

**Prerequisites**

1. [Install the Lightdash CLI](https://docs.lightdash.com/guides/cli/how-to-install-the-lightdash-cli)
2. [Login to Lightdash](https://docs.lightdash.com/guides/cli/cli-authentication)
3. Have credentials for Snowflake

**Create your first model**

Update `./lightdash/models/users.yml`
  - Update the `sql_from` to the name for the table you want to explore in lightdash 
  - Update the `dimensions` and `metrics` to define your semantic layer
  
You can check your yaml files for any errors by running this CLI command:

```
lightdash lint
```
  
**Create your first lightdash project**

Deploy to lightdash using the CLI:

```
lightdash deploy --create --no-warehouse-credentials
```

**Updating your Lightdash project**
Once you've successfully deployed your first project, you can edit the `.yml` files and redeploy your project by doing:

```
lightdash deploy --no-warehouse-credentials
```

**Developing with AI**

If you're developing with Cursor / Claude Code / Kilo Code (or any other copilot) you should setup the following:
- Give your copilot this link for the Lightdash `.yml` format: https://raw.githubusercontent.com/lightdash/lightdash/refs/heads/main/packages/common/src/schemas/json/model-as-code-1.0.json
- Prompt your copilot to always use `lightdash lint` after making any changes
- Make sure your copilot has access to your warehouse schema, this makes it very fast to generate yaml files
