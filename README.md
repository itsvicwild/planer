# Wild Workspace v4.0.1 — PWA build

Wild Workspace is a static HTML/CSS/JavaScript planner. This package includes the installable Progressive Web App (PWA) shell for GitHub Pages.

## Changes in v4.0.1

- Added a segmented RU / EN language switch in Settings and expanded English coverage for common labels, statuses and task controls.
- Removed the four-week habit history chips from the home screen while preserving habit check-ins and stored history.
- Moved the task-priority control directly before Description in the new-task quick action row.
- Excluded overdue tasks from the Today list when they are already shown in the red “Didn't get to it?” block.
- Enriched Halloween and Christmas surface styling and seasonal particles; overdue-task borders stay red in every theme.

## Changes in v4.0.0

- Expanded the English dictionary for sync history, data safety confirmations, recurring events, habits, overdue tasks, calendar details and dynamic counts/dates.

- Follow-up polish: Settings cards are equal-width on desktop; task priority cycles directly between high/medium/low with color feedback; hour estimates can be adjusted in 0.5-hour increments from the task quick row.
- Made the Christmas theme icy blue with denser snow particles and cooler ambient glows; removed the obsolete animation explanation from Settings.
- Expanded English text coverage across calendar, statistics, forms, reminders and sync states; calendar weekday labels now follow the selected locale.
- Refreshed the Service Worker cache to v4.0.3 after these final v4.0 UI changes.

- Added Russian/English interface language selection in Settings; the chosen language is stored locally and restored on next launch.
- Added Halloween and Christmas themes with distinct accent palettes, falling seasonal particles, a themed logo badge, cat costumes, and seasonal cat messages. Light/dark mode remains available under either seasonal theme.
- Removed the old “Тише: без тряски” setting; overdue tasks retain their visible motion.
- Reworked habit history on Home into separated weekly chips so week labels and counts are readable.
- Fixed the desktop navigation rail while the page scrolls.
- Recalculated and verified the primary script CSP hash; refreshed the Service Worker cache to v4.0.3 so installed PWAs fetch the final v4.0.0 release files.

## Changes in v3.5.7

- Reorganized Settings: “Мои блоки” uses two-thirds of the desktop width on the left; “Оформление” uses the right third and combines theme, accent color, animation, and weekly load thresholds. Smaller screens stack the panels.
- Refreshed the inline-script CSP hash and Service Worker cache to v3.5.7.

## Changes in v3.5.6

- Fixed an incorrect CSP SHA-256 hash that prevented the main JavaScript from running; bumped the Service Worker cache to refresh installed PWA assets.

## Changes in v3.5.5

- Removed the board/list switch from the Tasks section; Tasks now stays in list view while Home's board remains available.
- Tasks with a checklist are automatically completed when their final step is checked, including when all steps are marked complete while editing and saving the task. This only applies when the checklist contains at least one step.
- Muted the Tasks archive preview and removed its explanatory subtitle.
- Simplified task creation/editing: removed the separate Photo shortcut, placed importance (!) and person-hours (ЧЧ) in compact top controls, and made Block and Project fields visible without an accordion.
- Refreshed the script CSP hash and bumped the Service Worker cache to v3.5.5.

## Changes in v3.5.4

- Rebuilt the Gantt header with aligned week and day labels, clear daily grid lines, a highlighted current day, and thinner block-summary bars.
- Added directional slide/fade transitions to calendar and task-block swipes; reduced-motion preferences are respected.
- Changed the calendar's default view to Week, including after a local data reset.
- Removed the redundant “Добавить задачу” button from the selected-block summary while keeping add buttons on sub-blocks.
- Softened the archive preview card and compacted the task-block summary on mobile.
- Bumped the Service Worker cache to v3.5.4.

## Changes in v3.5.3

- Made the selected navigation pills more elongated on desktop and mobile, closer to Material You navigation surfaces.
- Removed tasks scheduled for today from the Home screen's “Скоро” list, so they are not duplicated with “Сегодня”.
- Limited “Скоро” to five rows and sorted tasks by importance (high, medium, low), then by due date; upcoming holidays fill only remaining positions.
- Added contrasting surfaces, subtle borders and heading separators to statistics cards and metric tiles.
- Added a 15-second timeout to auth, refresh-token, and REST requests, including response-body reads, so mobile sign-in and initial cloud fetches cannot wait indefinitely.
- Added persistent error text in the sign-in dialog for authentication and first-sync failures.
- Bumped the Service Worker cache to v3.5.3.

## Changes in v3.5.2

- Fixed the mobile sign-in dialog: it no longer opens the virtual keyboard automatically when the dialog appears.
- Resized and repositioned the sign-in dialog using the mobile visual viewport so it can adapt when the keyboard is open.
- Made the primary **Войти** action full-width and sticky in the mobile dialog, above the keyboard when possible.
- Added a visible loading state to prevent repeated sign-in taps and Enter/Go key support for the email/password fields.
- Bumped the Service Worker cache version to `v3.5.2` so PWA clients can install this fix.

## Changes in v3.5.1

- Removed the Zen section and separated Statistics and Settings into independent navigation sections.
- Refined the responsive Statistics and Settings layouts to use the available desktop width cleanly and to stack appropriately on mobile.
- Added swipe navigation between calendar weeks/months and between task blocks.
- Increased contrast and consistency of overdue-task styling with a clearer red treatment.
- Removed the quick-add-habit control from the Home weekly block; habit management remains in Settings.
- Updated the Service Worker cache version to `v3.5.1` so installed PWA clients can activate the new app shell.
- Includes the cumulative fixes and safety improvements in the v3.5.x app build.

Wild Workspace is a static HTML/CSS/JavaScript planner. This package includes the installable Progressive Web App (PWA) shell for GitHub Pages, plus the current interface fixes.

## Changes in v2.10.0

- Reworked the week calendar with rounded event chips and a Google Calendar-inspired visual treatment.
- The all-day lane shows up to three items per day and opens the complete day view for the remaining items.
- Fixed the mobile week view so all seven days fit the screen without horizontal scrolling.
- The cloud-copy choice dialog now closes immediately after a selection, including when the sync request fails.
- Added a bottom-sheet entrance animation for quick add, plus a small animated piano cat for a warmer, calmer feel.
- Fixed weekly progress counting across ISO week-years, corrected week labels near New Year, and made the main HTML source compatible with PWA and Capacitor Android.
- Added responsive layout safeguards for narrow viewports and reduced-motion preferences.

## Changes in v2.9.0

- Reworked the cybercat completion animation into a clearer sequence: reach from the right edge, grab the task, retract while the task is carried away.
- Clicking the **Выполнено** drop zone on the home weekly board opens the archive. The drop zone still accepts dragged tasks.
- The **Создать аккаунт или войти** control in Settings has a dedicated responsive wrapper for consistent positioning.
- The task page shows only the three most recently completed tasks in the archive preview. **Ещё** opens a dedicated archive page with all completed tasks; filters and the restore action remain available.
- Added a PWA manifest, install icons, a scoped Service Worker, offline app-shell caching and runtime cache support for Google Fonts.
- Added `.nojekyll` for GitHub Pages.

## Publish on GitHub Pages

1. Upload the **contents of this folder** to the root of your GitHub repository (do not upload only the ZIP file).
2. Make sure `index.html`, `manifest.webmanifest`, `service-worker.js`, `.nojekyll`, and the `icons/` folder are in the publishing root.
3. Open **Settings → Pages** in GitHub and publish from branch `main`, folder `/(root)`.
4. Open the HTTPS GitHub Pages address. Service Workers and PWA installation require HTTPS (localhost also works for development).
5. In Chrome/Edge use the browser's install option; on Android Chrome choose **Install app** or **Add to Home screen**, depending on the browser version.

## Offline behavior and storage

The Service Worker caches the app shell so the application can open offline after it has been loaded successfully at least once. The app's current local persistence mechanisms are preserved; this update does not replace the existing data model with IndexedDB. Google Fonts are cached opportunistically when online, and system font fallbacks are used otherwise.

Supabase remains an optional online service. Account creation/login, cloud access, and remote attachment operations require an internet connection. The existing account/cloud behavior is preserved in this build.

## Local development

Serve this directory over HTTP, for example with Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/`. Opening `index.html` directly with `file://` does not enable PWA installation or Service Worker caching.

## Supabase

The existing Supabase configuration and `supabase-setup.sql` are included. Run that SQL script in the project's SQL Editor once if the cloud tables and private attachment bucket are not configured yet. Never put a `service_role` key into client-side code.
