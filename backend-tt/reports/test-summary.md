# Отчет о модульном тестировании

Дата формирования: 2026-05-25T20:41:48.272Z
Итоговый статус: PASSED

## Сводка

| Показатель | Значение |
| --- | ---: |
| Всего тестов | 19 |
| Успешно | 19 |
| Ошибок | 0 |
| Пропущено | 0 |
| Отменено | 0 |
| TODO | 0 |
| Длительность | 0.170s |

## Таблица тестовых сценариев

| Класс тестов | Проверяемый метод | Сценарий | Входные данные | Ожидаемый результат |
| --- | --- | --- | --- | --- |
| AuthServiceTest | registerUser() | Успешная регистрация нового пользователя | username = new_user, password = secret123; пользователь отсутствует в БД | Создан пользователь, записано событие user_created, возвращены accessToken и refreshToken |
| AuthServiceTest | registerUser() | Попытка регистрации с уже занятым именем пользователя | username = busy_user; запрос SELECT возвращает rowCount = 1 | Возвращается ошибка со статусом 409 и сообщением "Имя пользователя занято" |
| AuthServiceTest | loginUser() | Успешный вход пользователя в систему | username = known_user, password = secret123; в БД хранится корректный password_hash | Пароль проходит проверку bcrypt, возвращаются данные пользователя и JWT-токены |
| AuthServiceTest | loginUser() | Отказ при отсутствующем пользователе или неверном пароле | Пустой результат SELECT или password != password_hash | Возвращается ошибка со статусом 401 и сообщением "Неверные учетные данные" |
| AuthServiceTest | changePassword() | Успешная смена пароля | userId = 21, oldPassword = old-secret, newPassword = new-secret | Старый пароль подтвержден, выполнен UPDATE users с новым bcrypt-хэшем |
| AuthServiceTest | changePassword() | Отказ при неверном старом пароле | oldPassword = bad-secret, password_hash соответствует другому паролю | Возвращается ошибка со статусом 401 и сообщением "Неверные учетные данные" |
| AuthServiceTest | refreshAccessToken() | Обновление access token по refresh token | Корректный refreshToken и строка invalid.token.value | Для корректного refreshToken возвращается accessToken; для некорректного токена ошибка 401 |
| ProjectBoardServicesTest | ensureProjectExists() | Проверка существования проекта | projectId = 1 и projectId = 999 | Для существующего проекта возвращается объект проекта; для отсутствующего проекта ошибка 404 |
| ProjectBoardServicesTest | ensureDefaultColumnsForProject() | Создание стандартных колонок доски | projectId = 3; первый count = 0, повторный count = 4 | Для пустого проекта создаются todo, inprogress, review, done; повторное создание не выполняется |
| ProjectBoardServicesTest | getNextTaskNumber(), getNextTaskPosition() | Расчет следующего номера задачи и позиции в колонке | max(task_number) = 8, max(id) = 12, max(position) = 3 | Следующий номер задачи равен 13, следующая позиция равна 4 |
| ProjectBoardServicesTest | buildBoardFromTables() | Формирование структуры доски из колонок и задач | Колонки To Do и Done; одна задача в колонке, одна задача без актуальной колонки | Возвращается board с cardIds, cards и дополнительной колонкой Unassigned |
| ProjectBoardServicesTest | getBoardPayload() | Получение данных доски проекта | projectId = 4; проект существует, колонки отсутствуют | Проект проверен, созданы стандартные колонки, возвращена структура board |
| ProjectBoardServicesTest | syncBoardToTables() | Синхронизация новой доски с таблицами | Board с колонками todo/done и карточкой card-1 | Созданы колонки, задача, рассчитаны поля планирования и записан task_created в журнал |
| ProjectBoardServicesTest | syncBoardToTables() | Удаление задач и колонок, отсутствующих во входящей доске | В БД есть колонка done и задача card-10, во входящем board их нет | Выполнено удаление отсутствующей задачи и колонки, оставшаяся колонка обновлена |
| TaskUtilsTest | normalizePriorityForStorage(), normalizePriorityForBoard() | Нормализация приоритета для хранения и отображения | normal, HIGH, unknown, low | Значения приведены к medium/high/medium и Low/Medium для доски |
| TaskUtilsTest | normalizeTags() | Очистка и ограничение списка тегов | Массив тегов с пробелами, пустыми значениями и более чем 20 элементами | Пустые значения удалены, строки обрезаны, итоговый список ограничен 20 тегами |
| TaskUtilsTest | parsePlanningPayload() | Проверка параметров планирования задачи | plannedDate = 2026-05-25, durationWeeks = 1, durationDays = 9; некорректная дата и отрицательная длительность | Корректные значения нормализованы в 2 недели и 2 дня; ошибки отклонены |
| TaskUtilsTest | getTaskComparableState(), taskStatesEqual() | Сравнение эквивалентных состояний задачи | Два объекта задачи с разным форматом, но одинаковым смысловым состоянием | Состояния нормализованы и считаются равными |
| TaskUtilsTest | parseEntityId() | Проверка допустимости идентификаторов | 12, пустая строка, abc, -1 | 12 преобразуется в число, пустая строка дает null, некорректные значения отклоняются |

## Детализация

| № | Статус | Тест | Файл | Время выполнения |
| ---: | --- | --- | --- | ---: |
| 1 | PASS | Регистрация создает пользователя, записывает событие в журнал и возвращает JWT-токены | test/auth-service.test.js | 0.008s |
| 2 | PASS | Регистрация отклоняет занятое имя пользователя | test/auth-service.test.js | 0.000s |
| 3 | PASS | Вход в систему принимает корректные учетные данные и возвращает JWT-токены | test/auth-service.test.js | 0.004s |
| 4 | PASS | Вход в систему отклоняет отсутствующего пользователя и неверный пароль | test/auth-service.test.js | 0.003s |
| 5 | PASS | Смена пароля проверяет старый пароль и обновляет хэш пароля | test/auth-service.test.js | 0.005s |
| 6 | PASS | Смена пароля отклоняет неверный старый пароль | test/auth-service.test.js | 0.003s |
| 7 | PASS | Обновление access token выполняется только по корректному refresh token | test/auth-service.test.js | 0.001s |
| 8 | PASS | Проверка проекта возвращает найденный проект или ошибку 404 | test/project-board-services.test.js | 0.002s |
| 9 | PASS | Стандартные колонки доски создаются только для пустого проекта | test/project-board-services.test.js | 0.000s |
| 10 | PASS | Расчет номера и позиции задачи учитывает максимальные значения | test/project-board-services.test.js | 0.000s |
| 11 | PASS | Сборка доски преобразует колонки, карточки и задачи без колонки в структуру board | test/project-board-services.test.js | 0.000s |
| 12 | PASS | Получение доски проверяет проект, создает стандартные колонки и возвращает board | test/project-board-services.test.js | 0.000s |
| 13 | PASS | Синхронизация доски создает колонки, задачи и записи журнала активности | test/project-board-services.test.js | 0.001s |
| 14 | PASS | Синхронизация доски удаляет отсутствующие во входных данных задачи и колонки | test/project-board-services.test.js | 0.000s |
| 15 | PASS | Нормализация приоритета корректно подготавливает значения для хранения и вывода на доске | test/task-utils.test.js | 0.001s |
| 16 | PASS | Нормализация тегов удаляет пустые значения и ограничивает размер списка | test/task-utils.test.js | 0.001s |
| 17 | PASS | Парсинг параметров планирования принимает корректные значения и отклоняет ошибки | test/task-utils.test.js | 0.000s |
| 18 | PASS | Формирование состояния задачи создает стабильную структуру для сравнения | test/task-utils.test.js | 0.000s |
| 19 | PASS | Парсинг идентификаторов принимает только положительные числовые значения | test/task-utils.test.js | 0.000s |

## Интерпретация

Все проверенные модули прошли тестирование. Ошибок выполнения и нарушений ожидаемого поведения не выявлено.
