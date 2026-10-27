# Wild Workspace v2.8.0 — отчёт о проверках

## Изменения

- [x] Встроены URL Supabase и публичный publishable key; из пользовательского интерфейса убран ввод конфигурации.
- [x] Настройка аккаунта сведена к кнопке «Создать аккаунт или войти» и модальному окну email/пароля.
- [x] Исправлен расчёт недельной нагрузки: завершение задачи не исключает её оценку часов.
- [x] Из нагрузки событий исключены все типы, кроме «Работа / учёба».
- [x] Оценки задач распределяются по полному периоду от начала до дедлайна, включая недели, которые находятся за пределами текущей недели.
- [x] Название блока в диаграмме Ганта вставляется с HTML-экранированием; приоритет приводится к числу 1–3 перед формированием CSS-класса.
- [x] Привычки получают `weekKey`; при смене ISO-недели счётчик сбрасывается, обновляется версия записи.
- [x] Вложения загружаются в приватный bucket `ww-attachments`; ошибки загрузки показывают предупреждение, файлы помечаются «только на этом устройстве».
- [x] Конфликты синхронизации обрабатываются слиянием по `updatedAt`, tombstone-метками и условным PATCH по исходному `updated_at`.
- [x] Обновлены инструкция по облачной настройке и описание частного Storage bucket.
- [x] Демонстрационные записи получают `updatedAt` с момента первого создания.

## Изолированные логические проверки

- [x] Изменение статуса задачи `doing → done` не меняет результат `loadOf`.
- [x] Личное мероприятие не добавляет часы в `dayLoad`; рабочее событие учитывается.
- [x] Слияние сохраняет более новую версию задачи.
- [x] Слияние сохраняет другую задачу, изменённую только на удалённом устройстве.
- [x] Для пользовательских блоков сохраняется более новая версия.
- [x] Tombstone предотвращает возвращение удалённой задачи.
- [x] Название блока в строке диаграммы Ганта экранируется.
- [x] Обновление облачной записи ограничено совпадением прежнего `updated_at`.
- [x] SQL содержит создание приватного бакета и пользовательские Storage policies.
- [x] `node --check` для встроенного JavaScript завершился без ошибок.

## Важные ограничения проверки

- [ ] Живая браузерная проверка и полный end-to-end тест Supabase не подтверждены: Chromium в текущей среде блокируется политикой браузера. Файл прошёл синтаксическую и изолированную логическую проверку, но это не заменяет реальный тест на опубликованном HTTPS-сайте.
- [ ] Необходимо выполнить `supabase-setup.sql` в SQL Editor указанного проекта; без таблицы, RLS-политик и Storage bucket облачные функции работать не будут.
- [ ] После установки следует проверить создание аккаунта, подтверждение email (если включено), вход на втором устройстве, загрузку реального файла во вложения, а также конфликт при изменении одной задачи на двух устройствах.
- [ ] Фактическая публикация на GitHub Pages не выполнялась.

## Примечание по безопасности

Клиентский HTML содержит только предоставленный publishable key. `service_role` key в HTML не добавлялся. Защита данных зависит от работающих RLS- и Storage-политик; не отключай их и не делай `ww-attachments` публичным.

## v2.9.0 UI + PWA pass (26 Oct 2026)

- [x] Refined the cybercat sweep so the paw reaches the task, performs a brief grab, retracts, and the task is carried away on a matching delay.
- [x] Made the home-board “Выполнено” drop zone open the archive on click while preserving drag-and-drop completion.
- [x] Settings account creation/login button now uses a responsive, consistently aligned wrapper.
- [x] The task-page archive preview is capped at the three most recently completed tasks; “Ещё” opens a dedicated archive screen.
- [x] Added PWA manifest, 192/512 install icons, scoped Service Worker, app-shell caching, and `.nojekyll` for GitHub Pages.
- [x] Static QA: both inline scripts and Service Worker pass `node --check`; manifest parses as JSON; all local PWA assets resolve; no duplicate HTML IDs; CSS parses without top-level syntax errors.
- [ ] Browser-based install/offline end-to-end test after deployment to HTTPS. It should be completed against the published GitHub Pages URL.

## Wild Workspace v3.5.1 — release validation (27 Oct 2026)

- [x] Updated the PWA entry point to the validated `Wild_Workspace_v3.5.1.html` build.
- [x] Removed the Zen section; Statistics and Settings are separate navigation sections.
- [x] Added swipe handling for calendar period navigation and task-block navigation.
- [x] Removed the Home weekly-block shortcut for adding a habit; Settings remain the habit-management entry point.
- [x] Improved overdue-task contrast with the red color treatment.
- [x] Both inline JavaScript blocks pass `node --check`.
- [x] Both inline script hashes match the HTML Content Security Policy.
- [x] CSS parses without reported top-level syntax errors.
- [x] Service Worker cache version is bumped to `v3.5.1` to invalidate the previous app-shell cache.
- [ ] After publication, verify Service Worker activation, update visibility in an installed PWA, and the real Supabase account/sync flows in a browser.

## Wild Workspace v3.5.2 — mobile sign-in fix (27 Oct 2026)

- [x] Removed automatic email-field focus on touch/mobile devices so the virtual keyboard does not cover the login actions immediately.
- [x] Auth modal tracks `window.visualViewport` changes and constrains its height when the mobile keyboard opens.
- [x] Made the primary login action a full-width sticky mobile action and added an immediate loading state to prevent duplicate requests.
- [x] Enter/Go from the email or password field triggers the login action.
- [x] Mobile-emulated Playwright test confirms a login tap invokes the Supabase password-token request; mocked errors show feedback and restore the button.
- [x] Both inline scripts pass `node --check`; CSP hashes were recalculated and verified.
- [ ] Actual-device validation on the user's phone is still pending; GitHub Pages deployment/Service Worker update must finish before retesting.

## Wild Workspace v3.5.3 — UX and mobile sign-in hardening (27 Oct 2026)

- [x] Selected navigation indicators are more elongated on desktop and mobile.
- [x] Home “Скоро” excludes tasks scheduled for today and tasks due today.
- [x] Home “Скоро” shows no more than five rows and prioritizes high-importance tasks, then medium/low; nearest due date breaks ties.
- [x] Statistics KPI and chart cards have contrasting surfaces, borders, and heading separators.
- [x] Auth, refresh-token, and REST requests have a 15-second timeout, including response-body reads.
- [x] Persistent inline auth feedback explains timeout/network failures and errors during the first cloud read/write.
- [x] Service Worker cache version was bumped to `v3.5.3`.
- [x] Inline JavaScript passed `node --check`; CSP hashes were recalculated and matched both inline scripts.
- [x] CSS parses without reported syntax errors; HTML contains no duplicate IDs.
- [ ] Verify the published update and live Supabase sign-in from the user's physical Android phone.

## Wild Workspace v3.5.4 — calendar, Gantt, swipe and mobile task UI (27 Oct 2026)

- [x] Gantt now has week/day headers, daily separators, a current-day marker, and visually distinct block summary bars.
- [x] Calendar and task-block swipes use directional exit/entry animations; the reduced-motion preference skips the animation.
- [x] Calendar opens in Week view by default, including after local reset.
- [x] Removed the add-task button from the selected-block summary; sub-block add controls remain.
- [x] Archive preview surface is more muted; mobile block summary stacks its two KPI values side-by-side to reduce height.
- [x] Inline application JavaScript passed `node --check`; CSS parsed without syntax errors; CSP hashes were refreshed and verified.
- [ ] Visual validation on a physical mobile device remains pending.

## Wild Workspace v3.5.5 — task list, checklist completion and creation form (27 Oct 2026)

- [x] Removed the Tasks-section board/list switch and forced Tasks rendering to list view only; Home board behavior is unchanged.
- [x] Ticking the final checklist item completes a task with one or more steps, runs the existing completion animation, and archives the task. Existing manually completed tasks remain completed.
- [x] Saving a task with a non-empty checklist whose steps are all complete marks it done; tasks without checklists are not auto-completed.
- [x] Removed the task form's Photo shortcut. Image files remain addable through the generic File picker.
- [x] Importance and person-hour estimate are available as compact top controls; Block and Project fields are always visible.
- [x] Removed the task archive preview subtitle and softened the archive card and its rows.
- [x] Inline JavaScript parsed successfully via V8 compilation; CSP hash was recalculated against the complete primary inline script and matched the policy.
- [ ] Browser/physical-device visual QA remains pending.

