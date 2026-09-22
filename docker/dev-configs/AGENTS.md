<summary>
Development configuration files for Docker services in Lightdash's local development environment. Contains service-specific configuration files that are mounted into Docker containers to customize their behavior during development.
</summary>

<howToUse>
These configuration files are automatically used by the docker-compose.dev.yml setup. They are mounted as volumes into the respective containers:

```yaml
# In docker-compose.dev.yml
volumes:
    - ./dev-configs/sshd_config:/config/sshd/sshd_config
    - ./dev-configs/prometheus.dev.yml:/etc/prometheus/prometheus.yml
```

To modify service behavior, edit the relevant config file and restart the Docker services:

```bash
# After modifying configs
docker-compose -f docker/docker-compose.dev.yml restart
```

</howToUse>

<codeExample>
```yaml
# prometheus.dev.yml - Configure Prometheus scraping
scrape_configs:
  - job_name: 'lightdash'
    static_configs:
      - targets: ['lightdash-dev:9090']
    scrape_interval: 5s
    metrics_path: '/metrics'
```

```bash
# sshd_config - Key SSH settings for development
Port 2222
PasswordAuthentication no
AllowTcpForwarding yes
AuthorizedKeysFile .ssh/authorized_keys
```

</codeExample>

<importantToKnow>
- SSH server is configured for key-based authentication only (no passwords)
- SSH runs on port 2222 to avoid conflicts with host SSH
- Prometheus scrapes Lightdash metrics every 5 seconds from lightdash-dev:9090
- Configuration changes require container restart to take effect
- SSH config allows TCP forwarding for development workflows
- Prometheus targets the internal Docker network hostname 'lightdash-dev'
</importantToKnow>

<links>
@docker/docker-compose.dev.yml - Docker compose file that mounts these configs
@.env.development - Environment variables for Prometheus configuration
</links>
