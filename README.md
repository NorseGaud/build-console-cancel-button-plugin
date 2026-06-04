# Console Cancel Button (Jenkins plugin)

Adds a fixed **Cancel build** button to the bottom-right of build *console*
pages. The button appears only while the build is running, asks for
confirmation, and then gracefully aborts the build (the same action as the red
X in the Jenkins UI).

## Requirements

- Jenkins 2.426.3 or newer, running on Java 17+.
- To build: JDK 17 or newer and Maven 3.9.6+ (Maven 4 works too).

## Build

```bash
mvn -DskipTests package
```

The installable plugin is produced at `target/console-cancel-button.hpi`.

## Install

1. In Jenkins: **Manage Jenkins -> Plugins -> Advanced settings -> Deploy Plugin**.
2. Upload `target/console-cancel-button.hpi`.
3. Restart Jenkins when prompted.

## How it works

A `PageDecorator` injects a small script into every page footer. The script
does nothing unless the page URL ends in `/console` or `/consoleFull`. On a
console page it polls the build's `api/json` for `building` status; while the
build runs it shows the fixed cancel button. Clicking it POSTs to the build's
`stop` endpoint with a CSRF crumb.
