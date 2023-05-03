FROM gitpod/workspace-full

# postgres
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql \
    postgresql-contrib \
    && apt-get clean
    && sudo -u postgres createuser --superuser --createdb --createrole gitpod
    && sudo -u postgres createdb gitpod

# dbt
RUN pip3 install \
    "dbt-core~=1.4.0" \
    "dbt-postgres~=1.4.0"
