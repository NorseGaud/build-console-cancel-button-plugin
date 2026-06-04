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
