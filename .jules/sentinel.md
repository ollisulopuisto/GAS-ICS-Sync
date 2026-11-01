# Sentinel's Journal

## 2026-11-01 - Untrusted ICS Feed Internal Property Injection
**Vulnerability:** External ICS feeds can inject custom properties matching internal script properties (specifically `privacy`, `color`, and `parentCal`). When parsing feeds with ical.js, `getPrivacySettings` checked `event.hasProperty('privacy')` and parsed the JSON payload. If the user had not configured a per-source privacy override, a feed-supplied `PRIVACY:{"wipeTitles":false,...}` was parsed and used instead of the user's global privacy settings (`wipeTitles`, `wipeDescriptions`, `wipeLocations`), exposing sensitive event details to shared/public calendars.
**Learning:** In Google Apps Script and custom parser workflows where in-memory object properties are augmented onto parsed components (synthetic metadata on `ICAL.Component`), untrusted input components must be sanitized by stripping internal/synthetic property keys before applying script-managed properties.
**Prevention:** Always strip internal property namespaces or explicitly remove script-managed properties (`event.removeAllProperties(...)`) immediately after parsing untrusted inputs before setting application metadata.
