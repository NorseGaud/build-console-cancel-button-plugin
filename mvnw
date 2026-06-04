#!/usr/bin/env bash
# Run Maven with a supported JDK (17, 21, or 22). Use this when JAVA_HOME is unset
# or points at JDK 11 / 24+.
set -euo pipefail

if [ -z "${JAVA_HOME:-}" ]; then
  for candidate in \
    /Library/Java/JavaVirtualMachines/openjdk-21.jdk/Contents/Home \
    /Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home; do
    if [ -x "$candidate/bin/java" ]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi

if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
  echo "error: set JAVA_HOME to JDK 17, 21, or 22 (see README)" >&2
  exit 1
fi

export PATH="${JAVA_HOME}/bin:${PATH}"
exec mvn "$@"
