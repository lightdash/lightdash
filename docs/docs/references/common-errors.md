# Common errors

## Not a dbt project

```text
FetchError: request to http://0.0.0.0:8580/jsonrpc failed, reason: connect ECONNREFUSED 0.0.0.0:8580
```

This means:
* Can't find a valid dbt project
* Can't find a valid dbt profiles.yml file

You can check if there's a problem by running
```shell
dbt debug
```

If everything there looks fine then there's another reason that the server didn't start. Please share your setup 
and post a new issue