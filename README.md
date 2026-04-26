# inviteforwedd.ru — Docker

## Запуск

### 1) Через docker compose
```bash
cd inviteforwedd.ru
docker compose up --build
```

Сайт: http://localhost:8080  
Админка: http://localhost:8080/admin

Логин/пароль админки задаются в `docker-compose.yml` (переменные `ADMIN_USER`, `ADMIN_PASS`).

## Где править контент
- `denisandalina/content.json` — тексты/ссылки/картинки (обновляется на фронте через `content-loader.js`)

## Опросник для гостей
Форма на странице отправляет ответы в backend:
- POST `/api/rsvp`

Данные сохраняются в SQLite (volume `./data`).
В админке можно:
- посмотреть ответы в таблице,
- отредактировать или удалить запись,
- выгрузить Excel: кнопка «Скачать Excel (.xlsx)».
