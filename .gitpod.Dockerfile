FROM gitpod/workspace-full

# Installing multiple versions of dbt
# dbt 1.4 is the default
RUN python3 -m venv /home/gitpod/dbt1.4
RUN /home/gitpod/dbt1.4/bin/pip install \
    "dbt-postgres~=1.4.0" 


RUN python3 -m venv /home/gitpod/dbt1.5
RUN /home/gitpod/dbt1.5/bin/pip install \
    "dbt-postgres~=1.5.0"

RUN ln -s /home/gitpod/dbt1.5/bin/dbt /home/gitpod/dbt1.5/bin/dbt1.5

ENV PATH="${PATH}:/home/gitpod/dbt1.4/bin:/home/gitpod/dbt1.5/bin"


# Install postgres
RUN sudo apt-get update \
    && sudo apt-get install -y --no-install-recommends \
    postgresql \
    && sudo apt-get clean

# Setup PostgreSQL server for user gitpod
ENV PATH="/usr/lib/postgresql/14/bin:$PATH"
USER gitpod
ENV PGDATA /home/gitpod/.pgsql
RUN PGDATA="/home/gitpod/.pgsql" \
 && mkdir -p /home/gitpod/.pg_ctl/bin /home/gitpod/.pg_ctl/sockets $PGDATA \
 && initdb -D $PGDATA \
 && printf '#!/bin/bash\npg_ctl -D /home/gitpod/.pgsql -l /home/gitpod/.pg_ctl/log "-o -k /home/gitpod/.pg_ctl/sockets" start\n' > /home/gitpod/.pg_ctl/bin/pg_start \
 && printf '#!/bin/bash\npg_ctl -D /home/gitpod/.pgsql -l /home/gitpod/.pg_ctl/log "-o -k /home/gitpod/.pg_ctl/sockets" stop\n' > /home/gitpod/.pg_ctl/bin/pg_stop \
 && chmod +x /home/gitpod/.pg_ctl/bin/*
ENV PATH="/home/gitpod/.pg_ctl/bin:$PATH"
ENV DATABASE_URL="postgresql://gitpod@localhost"
ENV PGHOSTADDR="127.0.0.1"
ENV PGHOST="localhost"
ENV PGUSER="gitpod"
ENV PGDATABASE="postgres"
ENV PGPASSWORD=""
ENV PGPORT=5432
ENV SCHEDULER_ENABLED=true
ENV SITE_URL=http://localhost:3000
ENV LIGHTDASH_SECRET="not very secret"
ENV RUDDERSTACK_WRITE_KEY=1vikeGadtB0Y0oRDFNL2Prdhkbp
ENV RUDDERSTACK_DATA_PLANE_URL=https://analytics.lightdash.com
ENV DBT_DEMO_DIR=/workspace/lightdash/examples/full-jaffle-shop-demo
ENV NODE_ENV=development
ENV LIGHTDASH_LOG_LEVEL=debug

USER gitpod