# CPU image for hosted demos (e.g. Railway). AMD GPU deployments use Dockerfile.rocm.
# Build context: backend/
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    TORCH_HOME=/opt/torch WORKSIGHT_DATA_DIR=/data WORKSIGHT_DEVICE=cpu
WORKDIR /app

# CPU wheels only; the default index pulls multi-GB CUDA builds.
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.5,<3" "torchvision>=0.20,<1"
COPY pyproject.toml ./
COPY src ./src
RUN pip install .
# Bake the official ImageNet weights into the image so startup never downloads them.
RUN python -c "from torchvision.models import ResNet18_Weights, resnet18; resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)"

RUN mkdir -p /data
EXPOSE 8000
CMD ["sh", "-c", "uvicorn worksight.api:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
