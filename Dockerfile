FROM node:18-bullseye-slim

WORKDIR /app

# Устанавливаем зависимости 
COPY frontend-tt/task-tracker-frontend/package*.json ./
RUN npm ci

# Копируем исходники и собираем
COPY frontend-tt/task-tracker-frontend ./
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "--port", "4173"]
