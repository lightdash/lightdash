# LghtDash
There is a helm chart for deploying Lightdash.  

## Parameters

There is a source [values.yaml](values.yaml) file with all the possible options, here are the most important of them:


| Name                              | Description                                                                                                                                                                    | Default |
|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|
| args.secureCookies                | boolean value for SECURE_COOKIES environment variable                                                                                                                          | false   |
| args.trustProxy                   | boolean value for TRUST_PROXY environment variable                                                                                                                             | false   |
| args.lightdashSecret.rawValue     | The string value for variable LIGHTDASH_SECRET. Ignore if providing secret args.ligthdashSecret.secretName                                                                     |         |
| args.lightdashSecret.secretName   | The name of a secret containing value for variable LIGHTDASH_SECRET. Ignore if providing secret args.ligthdashSecret.rawValue                                                  |         |
| args.lightdashSecret.secretKey    | The key of the secret referenced by `args.lightdashSecret.secretName` containing value for variable LIGHTDASH_SECRET. Ignore if providing secret args.ligthdashSecret.rawValue |         |
| args.postgres.host                | The string value for variable PGHOST                                                                                                                                           |         |
| args.postgres.port                | The string value for variable PGPORT                                                                                                                                           | 5432    |
| args.postres.database             | The string value for variable PGDATABASE                                                                                                                                       |         |
| args.postgres.username.rawValue   | The string value for variable PGUSER. Ignore if providing secret args.postgres.username.secretName                                                                             |         |
| args.postgres.username.secretName | The name of a secret containing value for variable PGUSER. Ignore if providing secret `args.postgres.username.rawValue`                                                        |         |
| args.postgres.username.secretKey  | The key of a secret referenced by `args.postgres.username.secretName` containing value for variable PGUSER. Ignore if providing secret args.postgres.username.rawValue         |         |
| args.postgres.password.rawValue   | The string value for variable PGUSER. Ignore if providing secret `args.postgres.username.secretName`                                                                           |         |
| args.postgres.password.secretName | The name of a secret containing value for variable PGPASSWORD. Ignore if providing secret `args.postgres.password.rawValue`                                                    |         |
| args.postgres.password.secretKey  | The key of a secret referenced by `args.postgres.password.secretName` containing value for variable PGPASSWORD. Ignore if providing secret args.postgres.username.rawValue     |         |
|                                   |                                                                                                                                                                                |         |

There are other configurations for auto scaling, resources, services definition and ingress, following the standard helm definitions.