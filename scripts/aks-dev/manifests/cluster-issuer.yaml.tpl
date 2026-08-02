# Let's Encrypt production issuer using the HTTP-01 solver via ingress-nginx.
# HTTP-01 only needs the hostname to resolve to the NLB — works for sslip.io AND for a
# CNAME in a zone hosted in another AWS account (no Route53 API access required).
# Rendered by up.sh (envsubst) to fill ${LETSENCRYPT_EMAIL}.
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${LETSENCRYPT_EMAIL}
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
