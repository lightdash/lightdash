FROM python:3.12-slim

WORKDIR /opt/app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 安装 uv 并基于根目录 uv.lock 安装依赖
RUN pip install uv
COPY pyproject.toml uv.lock ./
RUN uv export --format requirements.txt --no-emit-project --no-hashes --frozen --output-file /tmp/requirements.txt \
    && uv pip sync --system /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# 复制 API 核心文件（运行时仍会被挂载覆盖）
COPY __init__.py ./
COPY api ./api
COPY core ./core
COPY infra ./infra
COPY services ./services

EXPOSE 8069

CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8069", "--reload"]
