# Render free web service: API and analysis worker in one container (docs/hosting.md). The web app is on Vercel.
FROM python:3.12-slim-bookworm
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY packages packages
COPY services services
COPY deploy/render/start.sh deploy/render/start.sh
ENV PYTHONUNBUFFERED=1
CMD ["sh", "deploy/render/start.sh"]
