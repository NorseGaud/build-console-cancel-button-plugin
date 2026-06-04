# Jenkins Console Cancel Button — Design

## Problem

On a Jenkins build's console page (e.g.
`https://jenkins.veertu.com/job/anka-tests-amd64/job/release%252F3.9/50/console`)
there is no way to cancel the running build from the page itself. The user must
navigate back to the job's main page and click the abort control, which takes
several clicks. We want a fixed "Cancel build" button pinned to the bottom-right
of the console page so the running build can be aborted in one click.

## Goals

- Show a fixed cancel button in the bottom-right corner **only on job console
  pages** (`/console` and `/consoleFull`).
- Show it **only while the build is still running**; remove it once the build
  finishes.
- Clicking it asks for confirmation, then gracefully aborts the build (the same
  action as the red X in the Jenkins UI).
- Delivered as a standard, installable Jenkins plugin (`.hpi`).

## Non-Goals

- No button on non-console pages (job page, dashboard, etc.).
- No hard kill / force terminate (`/term`, `/kill`); graceful abort (`/stop`)
  only.
- No new Jenkins-side configuration UI or persisted state.

## Environment / Baseline

- Target: recent Jenkins LTS (2.426+ / 2.440+).
- Java 17.
- Packaging: `hpi` via the Jenkins plugin parent POM.

## Architecture

A single server-side extension — a `hudson.model.PageDecorator` — is the only
Jenkins hook used. Jenkins renders a `PageDecorator`'s `footer.jelly` immediately
before `</body>` on every page. We use that hook to inject:

1. A small hidden config element (rendered server-side) exposing the Jenkins
   root URL (so context paths work) via a `data-root-url` attribute. The CSRF
   crumb is NOT rendered server-side; the client fetches a fresh crumb from
   `crumbIssuer/api/json` at click time (avoids stale crumbs in cached markup,
   and degrades gracefully when CSRF is disabled).
2. A `<script>` (and `<link>` for CSS) pointing at static plugin resources.

All decision logic lives client-side. The decorator runs on every page, but the
injected JS exits immediately unless the current URL is a console page, so the
button only appears where intended. No new HTTP endpoints and no server-side
state are introduced.

### Why PageDecorator

It is the standard, supported extension point for injecting markup into Jenkins
pages. Gating on the URL client-side satisfies the "console pages only"
requirement without a more invasive page-specific integration.

## Components

```
pom.xml                                                  # hpi packaging, LTS baseline, Java 17
src/main/java/.../CancelButtonPageDecorator.java         # @Extension marker class
src/main/resources/.../CancelButtonPageDecorator/footer.jelly  # injects config + script/style
src/main/webapp/cancel-button.js                         # all client logic
src/main/webapp/cancel-button.css                        # fixed bottom-right button styling
```

Static resources under `src/main/webapp/` are served at
`<rootURL>/plugin/<artifactId>/...`.

### footer.jelly responsibilities

- Emit a hidden config element exposing the Jenkins root URL via
  `data-root-url="${rootURL}"` (the client uses it to build the non-static
  `crumbIssuer` URL).
- Load `cancel-button.css` and `cancel-button.js` from plugin resources using
  `${resURL}` (cache-busting across plugin upgrades), with explicit closing tags.

## Data Flow

1. JS loads on the page and reads `location.pathname`. If it does not end with
   `/console` or `/consoleFull`, stop (do nothing, render nothing).
2. Derive the build URL by stripping the trailing `console` / `consoleFull`
   segment from the path. This naturally handles double-encoded multibranch URLs
   (e.g. `release%252F3.9`) because no manual decode/re-encode is performed.
3. Poll `GET <buildUrl>api/json?tree=building` on an interval (~3s).
4. While `building == true`, ensure the fixed cancel button is shown and
   schedule the next poll. When it becomes `false`, remove the button and stop
   polling. (Transient fetch failures keep the last known state and keep
   polling.)
5. On click: show a `confirm()` dialog. If confirmed, `POST <buildUrl>stop` with
   the crumb header (when available). Show a transient "Cancelling…" state on
   success; show an inline error on failure.

## Error Handling / Edge Cases

- **CSRF disabled** — crumb config absent; POST is sent without the crumb header.
- **No Cancel/Abort permission** — `POST stop` returns 403; surface an inline
  error message rather than failing silently.
- **Build finishes while watching** — polling flips `building` to false and the
  button is removed.
- **`consoleFull` view** — handled alongside `/console`.
- **Context path** (Jenkins hosted under `/jenkins`) — root URL comes from Jelly,
  not guessed from the browser.
- **Status poll failure** (network/transient) — keep the last known state; do not
  crash the poll loop.

## Build Compatibility Notes

- `GET api/json?tree=building` and `POST stop` (`doStop`) are supported by both
  freestyle and Pipeline/multibranch builds.

## Testing

- **Automated:** A `JenkinsRule` integration test that confirms the plugin loads
  and the `PageDecorator` injects the expected `<script>` reference into a
  rendered page.
- **Manual matrix** on the live instance:
  - Freestyle build, Pipeline build, multibranch build.
  - Build running (button shown) vs. finished (button absent).
  - A user lacking Cancel permission (inline 403 error shown).
  - Jenkins reachable at root path (and, if applicable, a context path).
