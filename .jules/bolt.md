# Bolt's Journal

## 2026-10-31 - Lazy Set caching for static lookup arrays in Google Apps Script
**Learning:** Google Apps Script scripts often define large lookup arrays at top level (e.g., `tzids` with 589 timezone entries in `tzid.gs`). Repeated `Array.prototype.indexOf` lookups inside per-event loops create significant O(N * M) overhead. Converting arrays directly at global scope to `Set` can break tests or external expectations that treat `tzids` as an Array, but lazily initializing a `Set` (`tzidsSet = new Set(tzids)`) maintains complete backwards compatibility while achieving O(1) lookups (~12x speedup).
**Action:** When optimizing static array lookups in Google Apps Script without changing the public contract or file structure, use a lazily-initialized `Set` variable.
