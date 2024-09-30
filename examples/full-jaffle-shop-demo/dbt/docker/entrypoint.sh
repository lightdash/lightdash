#!/bin/bash
set -e

dbt seed --profiles-dir ./docker
dbt run --profiles-dir ./docker
