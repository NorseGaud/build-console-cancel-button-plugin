# Jenkins Console Cancel Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable Jenkins plugin (`.hpi`) that pins a "Cancel build" button to the bottom-right of build console pages, shown only while the build is running, that gracefully aborts the build on click (after confirmation).

**Architecture:** A single `hudson.model.PageDecorator` extension injects a CSS link, a hidden config element (carrying the Jenkins root URL), and a deferred external JS file into every page footer. All behavior lives in the static JS: it bails out unless the URL is a console page, polls the build's `api/json` for `building` status, renders/removes the fixed button accordingly, and POSTs to the build's `stop` endpoint (with a freshly fetched CSRF crumb) on click.

**Tech Stack:** Jenkins plugin parent POM `4.88`, `jenkins.version 2.426.3`, Java 17, Maven (`hpi` packaging), vanilla JS + CSS, `JenkinsRule` for the integration test.

---

## Prerequisites / Build Environment (verified on this machine)

- **JDK:** No JDK is on `PATH`. Use the installed OpenJDK 21 LTS explicitly via
  `JAVA_HOME`:
  `JAVA_HOME=/Library/Java/JavaVirtualMachines/openjdk-21.jdk/Contents/Home`.
  Building on JDK 21 while `maven.compiler.release=17` produces Java 17 bytecode
  that runs on the target Jenkins (Java 17+).
- **Maven:** `4.0.0-rc-5` at `/usr/local/apache-maven` (`mvn`). We use Maven 4.
- **Every Maven command in this plan must be prefixed with the JAVA_HOME above**,
  e.g. `JAVA_HOME=/Library/Java/JavaVirtualMachines/openjdk-21.jdk/Contents/Home mvn -q -DskipTests package`.
- **Sandbox/network:** The first build downloads the parent POM, core, and test
  harness from `https://repo.jenkins-ci.org/public/`. Run builds with full
  network access; if Maven reports `~/.m2/repository/.locks` channel errors, run
  the command outside the filesystem sandbox (those lock files require write
  access Maven manages itself).
- **Maven 4 repo prefix filter (already handled):** `repo.jenkins-ci.org`'s
  server-side prefixes file omits `/org/jenkins-ci`, so Maven 4 refuses to fetch
  those artifacts. This is fixed durably by `.mvn/maven.config` containing
  `-Daether.remoteRepositoryFilter.prefixes=false`, committed in Task 1. Plain
  `mvn` commands therefore work as written below — no extra flag needed.
- **`index.jelly` (already handled):** `hpi` packaging requires
  `src/main/resources/index.jelly`; a minimal one was added in Task 1. A
  `.gitignore` with `target/` was also added.

## File Structure

```
pom.xml                                                                           # hpi packaging + baseline
src/main/java/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecorator.java   # @Extension marker
src/main/resources/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecorator/footer.jelly  # injects assets + root URL
src/main/webapp/cancel-button.css                                                 # fixed bottom-right styling
src/main/webapp/cancel-button.js                                                  # all client logic
src/test/java/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecoratorTest.java  # injection test
README.md                                                                         # build/install instructions (already exists; expand it)
```

Static files under `src/main/webapp/` are served at `<rootURL>/plugin/console-cancel-button/...` (the path segment is the `artifactId`).

**Note on testing scope:** The client JS behavior (polling, button show/hide, cancel POST) is verified by the **manual matrix** at the end — there is no JS toolchain in this project (YAGNI). The one automated test confirms the plugin loads and the decorator injects the script reference, which is the integration risk worth guarding.

---

### Task 1: Scaffold the buildable plugin (`pom.xml`)

**Files:**
- Create: `pom.xml`

- [ ] **Step 1: Create `pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.jenkins-ci.plugins</groupId>
    <artifactId>plugin</artifactId>
    <version>4.88</version>
    <relativePath/>
  </parent>

  <groupId>com.veertu.jenkins</groupId>
  <artifactId>console-cancel-button</artifactId>
  <version>1.0-SNAPSHOT</version>
  <packaging>hpi</packaging>

  <name>Console Cancel Button</name>
  <description>Adds a fixed Cancel button to build console pages so a running build can be aborted in one click.</description>

  <properties>
    <jenkins.version>2.426.3</jenkins.version>
    <maven.compiler.release>17</maven.compiler.release>
  </properties>

  <repositories>
    <repository>
      <id>repo.jenkins-ci.org</id>
      <url>https://repo.jenkins-ci.org/public/</url>
    </repository>
  </repositories>
  <pluginRepositories>
    <pluginRepository>
      <id>repo.jenkins-ci.org</id>
      <url>https://repo.jenkins-ci.org/public/</url>
    </pluginRepository>
  </pluginRepositories>
</project>
```

- [ ] **Step 2: Verify it resolves and builds an empty plugin**

Run: `mvn -q -DskipTests package`
Expected: `BUILD SUCCESS`, and `target/console-cancel-button.hpi` is produced. (First run downloads dependencies; allow a few minutes.)

- [ ] **Step 3: Commit**

```bash
git add pom.xml
git commit -m "build: scaffold console-cancel-button Jenkins plugin (parent 4.88, Java 17)"
```

---

### Task 2: PageDecorator extension + asset injection (with integration test)

**Files:**
- Create: `src/test/java/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecoratorTest.java`
- Create: `src/main/java/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecorator.java`
- Create: `src/main/resources/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecorator/footer.jelly`

- [ ] **Step 1: Write the failing integration test**

Create `src/test/java/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecoratorTest.java`:

```java
package com.veertu.jenkins.consolecancelbutton;

import static org.junit.Assert.assertTrue;

import org.junit.Rule;
import org.junit.Test;
import org.jvnet.hudson.test.JenkinsRule;

public class CancelButtonPageDecoratorTest {

    @Rule
    public JenkinsRule j = new JenkinsRule();

    @Test
    public void injectsCancelButtonAssets() throws Exception {
        JenkinsRule.WebClient wc = j.createWebClient();
        wc.getOptions().setJavaScriptEnabled(false);
        String html = wc.goTo("").getWebResponse().getContentAsString();
        assertTrue("footer should reference cancel-button.js",
                html.contains("cancel-button.js"));
        assertTrue("footer should reference cancel-button.css",
                html.contains("cancel-button.css"));
        assertTrue("footer should expose the Jenkins root URL for the client script",
                html.contains("data-root-url"));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mvn -q -Dtest=CancelButtonPageDecoratorTest test`
Expected: FAIL — the assertions fail because no decorator injects the assets yet (the page does not contain `cancel-button.js`).

- [ ] **Step 3: Create the `PageDecorator` extension**

Create `src/main/java/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecorator.java`:

```java
package com.veertu.jenkins.consolecancelbutton;

import hudson.Extension;
import hudson.model.PageDecorator;

/**
 * Registers a page decorator whose footer.jelly injects the cancel-button
 * assets into every page. The injected script renders the button only on
 * build console pages.
 */
@Extension
public class CancelButtonPageDecorator extends PageDecorator {
}
```

- [ ] **Step 4: Create the footer Jelly template**

Create `src/main/resources/com/veertu/jenkins/consolecancelbutton/CancelButtonPageDecorator/footer.jelly`:

```xml
<?jelly escape-by-default='true'?>
<j:jelly xmlns:j="jelly:core">
  <link rel="stylesheet" type="text/css"
        href="${resURL}/plugin/console-cancel-button/cancel-button.css"/>
  <div class="console-cancel-button-config"
       data-root-url="${rootURL}" style="display:none"></div>
  <script src="${resURL}/plugin/console-cancel-button/cancel-button.js"
          defer="defer"></script>
</j:jelly>
```

Notes (applied after code review): use `${resURL}` for the asset URLs
(cache-busting on plugin upgrade; resolves to the same static resource), keep
`${rootURL}` on `data-root-url` (the client builds the non-static `crumbIssuer`
URL from it), and use explicit `</div>`/`</script>` closing tags (self-closing
forms break under HTML5 parsing).

- [ ] **Step 5: Run the test to verify it passes**

Run: `mvn -q -Dtest=CancelButtonPageDecoratorTest test`
Expected: PASS — the rendered footer now references both `cancel-button.js` and `cancel-button.css`.

- [ ] **Step 6: Commit**

```bash
git add src/main/java src/main/resources src/test/java
git commit -m "feat: inject cancel-button assets via PageDecorator footer"
```

---

### Task 3: Client logic — `cancel-button.js` and `cancel-button.css`

**Files:**
- Create: `src/main/webapp/cancel-button.css`
- Create: `src/main/webapp/cancel-button.js`

- [ ] **Step 1: Create the stylesheet**

Create `src/main/webapp/cancel-button.css`:

```css
.console-cancel-button-container {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
}

.console-cancel-button {
  background: #d33833;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.console-cancel-button:hover:not(:disabled) {
  background: #b32b27;
}

.console-cancel-button:disabled {
  opacity: 0.7;
  cursor: default;
}

.console-cancel-button-status {
  font-size: 13px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 6px 10px;
  border-radius: 4px;
  max-width: 280px;
}

.console-cancel-button-status:empty {
  display: none;
}

.console-cancel-button-status--error {
  background: #d33833;
}
```

- [ ] **Step 2: Create the client script**

Create `src/main/webapp/cancel-button.js`:

```js
(function () {
  "use strict";

  var POLL_INTERVAL_MS = 3000;
  var CONSOLE_PATH_RE = /\/(console|consoleFull)\/?$/;

  function getRootUrl() {
    var el = document.querySelector(".console-cancel-button-config");
    return el ? el.getAttribute("data-root-url") || "" : "";
  }

  function isConsolePage() {
    return CONSOLE_PATH_RE.test(window.location.pathname);
  }

  function getBuildUrl() {
    // Strip the trailing console/consoleFull segment from the current path.
    // Works for double-encoded multibranch paths (e.g. release%252F3.9)
    // because no manual decode/encode is performed.
    return window.location.pathname.replace(CONSOLE_PATH_RE, "/");
  }

  function fetchBuildingStatus(buildUrl) {
    return fetch(buildUrl + "api/json?tree=building", {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error("status " + resp.status);
        return resp.json();
      })
      .then(function (data) {
        return data.building === true;
      });
  }

  function fetchCrumb(rootUrl) {
    return fetch(rootUrl + "/crumbIssuer/api/json", {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    })
      .then(function (resp) {
        if (!resp.ok) return null; // CSRF disabled or unavailable
        return resp.json();
      })
      .then(function (data) {
        if (!data || !data.crumbRequestField) return null;
        return { field: data.crumbRequestField, value: data.crumb };
      })
      .catch(function () {
        return null;
      });
  }

  var button = null;
  var statusEl = null;
  var cancelling = false;

  function ensureButton() {
    if (button) return;

    statusEl = document.createElement("span");
    statusEl.className = "console-cancel-button-status";

    button = document.createElement("button");
    button.type = "button";
    button.className = "console-cancel-button";
    button.textContent = "Cancel build";
    button.addEventListener("click", onCancelClick);

    var container = document.createElement("div");
    container.className = "console-cancel-button-container";
    container.appendChild(statusEl);
    container.appendChild(button);
    document.body.appendChild(container);
  }

  function removeButton() {
    if (!button) return;
    var container = button.parentNode;
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    button = null;
    statusEl = null;
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.toggle(
      "console-cancel-button-status--error",
      !!isError
    );
  }

  function onCancelClick() {
    if (cancelling) return;
    if (!window.confirm("Cancel this build?")) return;

    cancelling = true;
    button.disabled = true;
    button.textContent = "Cancelling\u2026";
    setStatus("", false);

    var rootUrl = getRootUrl();
    var buildUrl = getBuildUrl();

    fetchCrumb(rootUrl)
      .then(function (crumb) {
        var headers = {};
        if (crumb) headers[crumb.field] = crumb.value;
        return fetch(buildUrl + "stop", {
          method: "POST",
          headers: headers,
          credentials: "same-origin"
        });
      })
      .then(function (resp) {
        if (resp.status === 403) {
          throw new Error("You do not have permission to cancel this build.");
        }
        if (!resp.ok) {
          throw new Error("Cancel failed (" + resp.status + ").");
        }
        // Success: the poll loop removes the button once building flips false.
      })
      .catch(function (err) {
        cancelling = false;
        if (button) {
          button.disabled = false;
          button.textContent = "Cancel build";
        }
        setStatus(err.message || "Cancel failed.", true);
      });
  }

  function scheduleNextPoll(buildUrl) {
    window.setTimeout(function () {
      poll(buildUrl);
    }, POLL_INTERVAL_MS);
  }

  function poll(buildUrl) {
    fetchBuildingStatus(buildUrl)
      .then(function (building) {
        if (building) {
          ensureButton();
          scheduleNextPoll(buildUrl);
        } else {
          // Build is finished: remove the button and stop polling.
          removeButton();
        }
      })
      .catch(function () {
        // Transient failure: keep the last known state and keep polling.
        scheduleNextPoll(buildUrl);
      });
  }

  function init() {
    if (!isConsolePage()) return;
    poll(getBuildUrl());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
```

- [ ] **Step 3: Rebuild the plugin to bundle the assets**

Run: `mvn -q -DskipTests package`
Expected: `BUILD SUCCESS`; `target/console-cancel-button.hpi` now contains the JS and CSS under the plugin webapp path.

- [ ] **Step 4: Commit**

```bash
git add src/main/webapp/cancel-button.js src/main/webapp/cancel-button.css
git commit -m "feat: add fixed cancel button client logic and styling"
```

---

### Task 4: README + final build verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Expand `README.md` with build/install instructions**

Replace the contents of `README.md` with:

```markdown
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

1. In Jenkins: **Manage Jenkins → Plugins → Advanced settings → Deploy Plugin**.
2. Upload `target/console-cancel-button.hpi`.
3. Restart Jenkins when prompted.

## How it works

A `PageDecorator` injects a small script into every page footer. The script
does nothing unless the page URL ends in `/console` or `/consoleFull`. On a
console page it polls the build's `api/json` for `building` status; while the
build runs it shows the fixed cancel button. Clicking it POSTs to the build's
`stop` endpoint with a CSRF crumb.
```

- [ ] **Step 2: Run the full build with tests**

Run: `mvn -q clean package`
Expected: `BUILD SUCCESS`, `CancelButtonPageDecoratorTest` passes, and `target/console-cancel-button.hpi` is produced.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document build, install, and behavior"
```

- [ ] **Step 4: Manual verification matrix (on the live Jenkins instance)**

Install the `.hpi` and confirm:
- On a **running** freestyle build's `/console` page, the red "Cancel build"
  button appears bottom-right.
- On a **running** Pipeline / multibranch build's `/console` page (e.g.
  `.../job/anka-tests-amd64/job/release%252F3.9/<n>/console`), the button
  appears and clicking it (after confirming) aborts the build.
- The `/consoleFull` view also shows the button.
- After the build finishes (or is cancelled), the button disappears within
  ~3 seconds.
- On non-console pages (job page, dashboard) the button never appears.
- A user **without** Cancel permission sees an inline permission error when
  clicking, rather than a silent failure.
```
