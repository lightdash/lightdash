---
sidebar_position: 5
sidebar_label: Update Lightdash
---

# Updating Lightdash to the latest version

## Local deployments

If you're running Lightdash on your own laptop using Docker, you just need to instruct Docker to pull
the latest version of Lightdash:

```shell
docker pull lightdash/lightdash
```

Now restart Lightdash and you'll be upgraded to the latest version.

## Kubernetes/helm deployments

If you install Lightdash into kubernetes using our [community helm charts](https://github.com/lightdash/helm-charts)
you need to update your helm chart repository and upgrade your deployment.

```shell
helm repo update lightdash
helm upgrade -f values.yml lightdash lightdash/lightdash
```
