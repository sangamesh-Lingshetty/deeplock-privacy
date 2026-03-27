# DeepLock Project Summary

## What DeepLock Is

DeepLock is a Chrome Extension built to help users focus by blocking distracting websites during timed work sessions.

Core idea:

- User chooses a focus duration
- DeepLock locks the session
- Distracting sites are blocked
- User sees a strict interruption flow if they try to visit blocked sites
- Stats, streaks, and usage data are tracked locally
- Pro users get premium features like cloud sync, dashboard analytics, custom blocked sites, schedules, and Insights

---

## Current Product Scope

DeepLock currently includes:

- Focus session timer
- Hard website blocking during active sessions
- Block interruption pages
- Session completion reward screen
- Local session stats and streak tracking
- Free vs Pro feature gating
- Lemon Squeezy license activation and validation
- Google sign-in with Supabase cloud sync
- Pro analytics dashboard
- Custom blocked websites
- Scheduled focus sessions
- Website usage tracking
- Insights tab with focus analytics
- Dashboard dark/light theme toggle
- Pre-session energy check-in
- Shareable weekly stat card
- Smart Lock (Auto Kill)

---

## Main Files And Responsibilities

### [manifest.json](/D:/deeplock/manifest.json)

Chrome Extension configuration.

Contains:

- MV3 setup
- permissions
- host permissions
- background service worker registration
- popup registration
- web accessible resources
- Google OAuth client config

### [background.js](/D:/deeplock/background.js)

Main runtime and backend logic of the extension.

Handles:

- starting sessions
- dynamic blocking rules
- unlocking sessions
- streak and stats updates
- notifications
- alarms
- scheduled sessions
- Pro validation
- Lemon Squeezy license activation/validation
- site usage tracking
- auto kill switch intervention logic
- hard mode behavior

### [popup.html](/D:/deeplock/popup.html), [popup.js](/D:/deeplock/popup.js), [popup.css](/D:/deeplock/popup.css)

Main user popup UI.

Handles:

- selecting session duration
- entering focus intent
- starting session
- showing active session timer
- showing free-plan limits
- Pro upgrade flow
- license key activation
- custom blocked site management for Pro

### [dashboard.html](/D:/deeplock/dashboard.html), [dashboard.js](/D:/deeplock/dashboard.js), [dashboard.css](/D:/deeplock/dashboard.css)

Premium dashboard UI for Pro users.

Contains tabs for:

- Overview
- History
- Streaks
- Blocked Sites
- Profile
- Schedule
- Insights

Also includes:

- Pro gate
- theme toggle
- analytics rendering
- schedule management
- subscription management UI
- Smart Lock settings UI

### [supabase.js](/D:/deeplock/supabase.js)

All Supabase and Google auth logic in one file.

Handles:

- Google sign in using `chrome.identity.launchWebAuthFlow`
- session retrieval
- sign out
- profile upsert
- session history save
- cloud stats sync
- custom domain sync
- schedule CRUD with Supabase

### [pause.html](/D:/deeplock/pause.html), [pause.js](/D:/deeplock/pause.js)

Intermediate interruption screen shown when user opens a blocked site.

Behavior:

- shows a short urge-delay countdown
- shows focus intent and remaining session time
- redirects to blocked page after countdown

### [session_complete.html](/D:/deeplock/session_complete.html), [session_complete.js](/D:/deeplock/session_complete.js)

Reward screen shown when a focus session ends.

Behavior:

- shows session completion state
- shows duration completed
- shows urges resisted during that session
- shows current streak
- gives quick actions to start another session or open Insights

### [blocked.html](/D:/deeplock/blocked.html), [blocked.js](/D:/deeplock/blocked.js)

Final blocked screen.

Behavior:

- shows current focus intent
- shows remaining session time
- shows how many sites are blocked
- shows blocked site list

### [README.md](/D:/deeplock/README.md)

Currently contains the privacy policy rather than a developer readme.

### [hardmode.html](/D:/deeplock/hardmode.html), [hardmode.js](/D:/deeplock/hardmode.js)

Strict interruption page for hard mode.

Behavior:

- shows hard mode state
- shows remaining time
- removes any visible exit path

### [uninstall.html](/D:/deeplock/uninstall.html), [uninstall.js](/D:/deeplock/uninstall.js)

Retention/churn page for uninstall flow.

Behavior:

- shows focus time
- shows streak
- shows sessions
- asks why the user is leaving
- shows a retention offer

---

## Core User Flows

## 1. Start Focus Session

Flow:

- user opens popup
- user enters what they are working on
- user selects energy level
- user selects duration
- popup sends `startBlock` message to background
- background validates Pro state with Lemon Squeezy
- background checks free plan daily limit
- background chooses blocked domains
- session state is written to `chrome.storage.local`
- blocking rules are enabled using Chrome declarative rules
- unlock alarm is scheduled
- popup switches to active session state

Tracked session data includes:

- `isLocked`
- `lockEndTime`
- `sessionDuration`
- `focusIntent`
- `sessionStartTime`
- `sessionEnergyLevel`
- `sessionBlockedAttempts`
- `blockedDomains`
- `todaySessionCount`
- `todayDate`

## 2. Visit Blocked Website

Flow:

- active session exists
- user opens a blocked domain
- Chrome redirects request to `pause.html`
- short countdown runs
- page redirects to `blocked.html`
- if the session has already ended, interruption pages exit cleanly instead of showing a stale `0 min` blocker

This creates friction and reinforces commitment.

## 3. Session Ends

Flow:

- unlock alarm fires
- background runs `unlockSession()`
- blocking rules are removed
- total sessions increase
- total focus minutes increase
- daily session minutes update
- streak logic updates
- notification is shown
- session completion screen opens
- session is appended into focus session log
- Pro users sync session + stats to Supabase

## 4. Pro Purchase / Activation

Flow:

- user buys Pro on Lemon Squeezy or enters license key
- background activates and validates against Lemon Squeezy API
- local `isPro` is overwritten only from server-verified state
- Pro UI is unlocked

## 5. Google Sign In + Cloud Sync

Flow:

- user signs in with Google
- `supabase.js` launches auth flow
- tokens are stored locally
- profile is upserted in Supabase
- dashboard/history/settings can sync across devices

## 6. Scheduled Sessions

Flow:

- Pro user creates a schedule in dashboard
- schedule is saved locally first
- background alarm is registered
- optional Supabase save runs in background
- when alarm fires, background starts a focus session automatically
- repeating schedules generate the next schedule

## 7. Insights

Flow:

- background tracks active website hostname time
- data is stored per day in `siteUsage`
- Insights tab reads this data
- chart and cards are rendered
- non-Pro users see lock/upgrade state

## 8. Auto Kill Switch

Flow:

- user enables Smart Lock in Blocked Sites tab
- user sets a trigger threshold in minutes
- background watches active distracting/custom domains
- background stores active Smart Lock tracking state locally
- background schedules a Chrome alarm for the trigger threshold
- dashboard changes refresh Smart Lock tracking immediately
- if user stays too long on the same distracting domain
- DeepLock opens an intervention overlay on the active site
- user chooses `Lock it` or `Continue`
- `Lock it` opens the main DeepLock lock flow with a suggested intent prefilled
- after the user starts the new focus session, DeepLock reloads the original distracting tab so blocking applies immediately
- `Continue` closes the intervention and restarts the watch timer

---

## Storage Model

DeepLock uses `chrome.storage.local` heavily.

### Session And Stats Keys

- `isLocked`
- `lockEndTime`
- `sessionDuration`
- `focusIntent`
- `sessionStartTime`
- `blockedDomains`
- `lastFocusTime`
- `todaySessionCount`
- `todayDate`
- `totalSessions`
- `totalFocusMinutes`
- `currentStreak`
- `longestStreak`
- `dailySessions`
- `lastSessionDate`
- `blockedAttempts`
- `todayBlockedAttempts`
- `sessionBlockedAttempts`
- `sessionEnergyLevel`
- `sessionCompleteData`
- `focusSessionLog`

### Pro / Billing Keys

- `isPro`
- `licenseKey`
- `licenseInstanceId`
- `licenseValidatedAt`

### Supabase / Auth Keys

- `sbAccessToken`
- `sbRefreshToken`
- `sbUserId`
- `sbEmail`
- `sbSignedIn`

### Custom Blocking Keys

- `customBlockedDomains`

### Schedule Keys

- `schedules`
- `scheduledSessionId`

### Insights / Usage Tracking Keys

- `siteUsage`
- `siteUsageTrackingState`

### Auto Kill Switch Keys

- `autoKillEnabled`
- `autoKillMinutes`
- `autoKillSites`
- `autoKillIntervention`
- `ignoredWarnings`

### Theme Key

- `dashboardTheme`

---

## Free Plan vs Pro Plan

## Free Plan

- default blocked sites only
- daily session limit
- no custom site list
- no premium dashboard access
- no premium insights access

## Pro Plan

- unlimited sessions
- longer/custom durations
- custom blocked sites
- dashboard analytics
- cloud sync
- session history sync
- streak protection via cloud
- scheduled sessions
- insights tab

---

## Default Blocked Sites

The extension includes a default set of distracting sites such as:

- Instagram
- X / Twitter
- Twitter
- YouTube
- Reddit
- Facebook
- TikTok
- Netflix
- Twitch
- Discord

The popup and dashboard also allow Pro users to add more custom domains.

---

## Dashboard Tabs

## 1. Overview

Shows:

- total hours focused
- total sessions
- blocked attempts
- current streak
- 7-day bar chart
- today summary
- all-time records
- motivation quote

## 2. History

Shows:

- local history fallback
- cloud session history when signed in
- last 90 days session list

## 3. Streaks

Shows:

- current streak hero
- 28-day heatmap
- longest streak
- active days

## 4. Blocked Sites

Shows:

- default blocked sites
- Smart Lock (Auto Kill) settings
- Smart Lock armed-site controls and per-site trigger minutes
- Smart Lock live status summary and intervention readiness state
- category-based site browser
- search/add custom sites
- clear and manage custom blocked list

## 5. Profile

Shows:

- Google sign-in / sign-out
- synced account state
- license key display
- subscription management UI
- support contact
- reset local data action

## 6. Schedule

Shows:

- create scheduled session form
- repeat options
- live preview
- upcoming schedules list
- schedule delete
- test/debug helpers

## 7. Insights

Shows:

- animated 7-day usage trend chart
- focus score card
- day quality label
- daily insight message
- focus vs distracting time breakdown
- peak focus hour insight
- best energy pattern insight
- top 5 sites with favicon, time, and bar
- shareable stat card action
- Pro lock state for non-Pro users

---

## Insights Feature Details

Insights was added as a premium analytics layer to show how users actually spend time on websites.

### Tracked Data Shape

Stored under `siteUsage`:

```json
{
  "2026-03-26": {
    "date": "2026-03-26",
    "sites": {
      "youtube.com": 120,
      "twitter.com": 45
    }
  }
}
```

### How Tracking Works

Background script tracks:

- active tab changes
- active tab URL changes
- tab removal
- window focus changes
- startup refresh

It records hostname usage for HTTP/HTTPS tabs only.

### Insights Calculations

Computed values:

- `totalTime`
- `topSites`
- `distractingTime`
- `focusTime`
- `focusScore`

Distracting domains currently include:

- `youtube.com`
- `twitter.com`
- `instagram.com`
- `reddit.com`
- `facebook.com`
- `tiktok.com`

### Focus Score Formula

```text
focusScore = Math.round((focusTime / totalTime) * 100)
```

Clamped between `0` and `100`.

### Insights UI Blocks

- Usage Trend chart
- Focus Score card
- Day Quality label
- Daily Insight text
- Usage Breakdown card
- Peak Focus Hour pattern
- Best Energy pattern
- Top Sites card
- Share your week export
- right-side Life Impact visualization card

### Insights Visualization Notes

- Usage Trend now uses a clearer Chart.js bar chart for the last 7 days
- Life Impact uses a smaller right-side visualization card instead of a large static ring layout
- core Insights calculations and storage logic remain unchanged; only presentation was improved

### Daily Insight Message

Generated from the highest-usage site for the day.

Examples:

- "You spent 3h 20m on youtube.com today."
- "Your biggest distraction was twitter.com (1h 10m) today."

---

## Theme System

Dashboard now supports two visual modes:

- dark mode
- light mode

### Theme Toggle

Location:

- bottom-left of dashboard sidebar

Behavior:

- click button to switch theme
- selection persists in `chrome.storage.local`
- dashboard reads saved theme on load

### Design Direction

Dark mode:

- existing premium dark UI
- strong contrast
- blue highlight accents

Light mode:

- warm premium paper-like palette
- softer borders
- maintained contrast and readability

### Typography System

DeepLock now uses a shared typography system across the product:

- `DM Sans` for body text, controls, labels, and general UI copy
- `Syne` for key display headings and premium page titles
- `Space Mono` for stats, timers, badges, and technical/meta UI

This keeps popup and dashboard typography visually consistent while preserving a premium product feel.

---

## Retention And Emotional Features

DeepLock now includes stronger emotional loops:

- session complete reward screen
- per-session urge count
- real-time "you resisted X distractions today" message
- evening streak-risk notification logic
- energy-based focus pattern detection
- shareable weekly stat card for progress signaling
- auto kill intervention popup when doom-scrolling goes too long

---

## Billing And Subscription

DeepLock uses Lemon Squeezy for:

- Pro purchases
- license activation
- license validation
- customer portal / billing management

Subscription management UI in dashboard includes:

- active plan state
- payment update link
- cancel trigger
- retention flow
- pause offer
- cancellation reason collection

---

## Supabase Cloud Layer

Supabase is used for:

- Google auth
- profile storage
- cloud session history
- cloud stats sync
- custom blocked domains sync
- schedule sync

### Main Supabase Functions

- `signInWithGoogle()`
- `signOut()`
- `getSession()`
- `upsertProfile()`
- `saveSession()`
- `syncStats()`
- `saveCustomDomains()`
- `loadCloudSettings()`
- `getSessionHistory()`
- `saveSchedule()`
- `getSchedules()`
- `deleteSchedule()`
- `markScheduleUsed()`

---

## Notifications And Reminder System

Background alarms currently support:

- unlock alarm
- weekly reminder
- inactivity reminder
- morning reminder
- evening reminder
- weekly report
- scheduled session alarms

Reminder strategy includes:

- morning focus nudges
- evening nudges
- weekly report for Pro users
- inactivity nudges after long gaps

---

## Hard Mode / Anti-Escape Behavior

DeepLock includes strict friction features during active sessions.

Current hard mode behavior includes:

- watching for `chrome://extensions`
- opening intervention page when user tries to disable/remove extension mid-session
- setting uninstall URL with guilt/retention data
- checking reinstall / mid-session quit patterns

Note:

There are references to `hardmode.html` and `uninstall.html` in the codebase/manifest, but those files are not currently present in the repository.

---

## Important Utility Functions

Some key utility and helper logic added/used:

- `formatMinutes(mins)`
- `computeInsights(siteMap)`
- `getLast7DaysUsage(siteUsage)`
- `renderInsightsTrendChart(days)`
- `renderInsightsTopSites(topSites, totalTime)`
- `enableBlocking(domains)`
- `disableBlocking()`
- `unlockSession()`
- `handleScheduleRepeat()`

---

## Current Strengths Of The Project

- strong product direction
- good premium / free separation
- clear conversion path to Pro
- all major user flows already exist
- analytics dashboard is substantial
- cloud sync architecture is already integrated
- Insights now adds a second layer of behavior analysis

---

## Current Known Gaps / Notes

- `README.md` is a privacy policy, not a contributor/developer readme
- `hardmode.html` is referenced but missing
- `uninstall.html` is referenced but missing
- some older text content has encoding artifacts in legacy files
- site usage tracking is lightweight active-tab tracking, not full enterprise-grade browsing telemetry

---

## What Has Been Built Till Now

End-to-end, DeepLock now includes:

- Chrome extension popup
- focus timer flow
- site blocking engine
- interruption pages
- stats and streak tracking
- free plan limits
- Pro purchase and activation
- Lemon Squeezy validation
- Google sign-in
- Supabase sync
- premium dashboard
- blocked sites manager
- session history
- streak analytics
- schedule builder
- schedule sync
- subscription retention flow
- website usage tracking
- insights analytics tab
- focus score system
- session completion reward card
- real-time urge counter
- hard mode page
- uninstall retention page
- pre-session energy check-in
- focus pattern analysis by hour and energy
- shareable weekly stat card export
- smart lock auto kill switch
- premium light/dark dashboard theme toggle
- animated insights usage chart

DeepLock is no longer just a blocker.

It is now a focus product with:

- enforcement
- analytics
- monetization
- cloud sync
- premium dashboard UX
