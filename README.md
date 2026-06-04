# Console Cancel Button (Jenkins plugin)

Adds a fixed **Cancel build** button to the bottom-right of build *console*
pages. The button appears only while the build is running, asks for
confirmation, and then gracefully aborts the build (the same action as the red
X in the Jenkins UI).

![Console Cancel Button](jenkins-console-cancel-button.png)


## Development

### Requirements

- **Runtime:** Jenkins 2.426.3 or newer, running on Java 17+.
- **Build:** JDK **17, 21, or 22** (LTS) and Maven 3.9.6+ (Maven 4 works too).

Maven must run on one of those JDKs. **Do not use JDK 11** (the HPI plugin will
ignore `maven.compiler.release=17` and compile as Java 11) or **JDK 24+** (the
license build step fails with `Unsupported class file major version 70`).

#### Set `JAVA_HOME` first

macOS (Homebrew OpenJDK 21):

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/openjdk-21.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
java -version   # should report 17, 21, or 22
```

If you use [jenv](https://github.com/jenv/jenv) or [asdf](https://asdf-vm.com/),
the repo includes `.java-version` (`21`).

The repo includes `.mvn/maven.config` so Maven 4 can resolve artifacts from
`repo.jenkins-ci.org` (no extra flags needed).

### Build and test

**Easiest on macOS:** use `./mvnw` — it picks Homebrew JDK 21 or 17 when `JAVA_HOME`
is unset (avoids the JDK 11 / JDK 24 failures below).

```bash
chmod +x mvnw   # once
./mvnw clean package
```

Or set `JAVA_HOME` yourself (same JDK as [CI](.github/workflows/ci.yml), Temurin 17),
then run `mvn`:

Full build with tests:

```bash
mvn clean package
```

Build the `.hpi` without running tests (faster iteration):

```bash
mvn -DskipTests package
```

Run tests only:

```bash
mvn test
```

Run a single test class:

```bash
mvn -Dtest=CancelButtonPageDecoratorTest test
```

#### Troubleshooting

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| `Unsupported class file major version 70` during `license:process` | Maven is running on **JDK 24+** | `export JAVA_HOME` to JDK 17, 21, or 22 (see above) |
| Log shows `java-level/11` and `release 11` | Maven is running on **JDK 11** | Same: use JDK 17–22 |
| `Unable to locate a Java Runtime` | No JDK on `PATH` | Set `JAVA_HOME` and add `$JAVA_HOME/bin` to `PATH` |
| Tests pass but `BUILD FAILURE` at license step | Wrong JDK for Maven itself, not the compiler flag in `pom.xml` | Verify with `java -version` in the **same shell** as `mvn` |

The installable plugin is written to `target/console-cancel-button.hpi`. The
first build downloads the Jenkins parent POM, core, and test harness from
`repo.jenkins-ci.org` and may take a few minutes.

### Continuous integration

GitHub Actions runs `mvn clean package` on every push and pull request (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
