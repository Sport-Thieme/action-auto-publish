const core = require("@actions/core");
const exec = require("@actions/exec");

const repo = process.env.GITHUB_REPOSITORY;
const package = `@${repo.toLowerCase()}`;

const cmd = async (command, ...args) => {
  let output = "",
    errors = "";
  const options = {
    silent: true,
  };
  options.listeners = {
    stdout: data => {
      output += data.toString();
    },
    stderr: data => {
      errors += data.toString();
    },
    ignoreReturnCode: true,
    silent: true,
  };

  await exec.exec(command, args, options).catch(err => {
    core.info(`The command '${command} ${args.join(" ")}' failed: ${err}`);
  });

  if (errors !== "") {
    core.info(`stderr: ${errors}`);
  }

  return output;
};

const currentVersion = async () => {
  const ycmd = `yarn info ${package} --json`;
  try {
    const useLatest = core.getInput("useLatest") || true;
    const jsonString = await cmd(ycmd);
    const info = JSON.parse(jsonString);
    const latest =
      (useLatest && info.data["dist-tags"] && "latest" in info.data["dist-tags"]
        ? info.data["dist-tags"].latest
        : info.data.versions.pop()) || "0.0.0";
    const matches =
      latest.match(/(\d*)\.(\d*).(\d*)-{0,1}([a-z0-9]*)\.{0,1}(\d*)/i) || [];
    return {
      major: parseInt(matches[1] || "0", 10),
      minor: parseInt(matches[2] || "0", 10),
      patch: parseInt(matches[3] || "0", 10),
      beta: matches[4] === "beta",
      prerelease:
        matches[4] !== "" ? parseInt(matches[5] || "0", 10) : undefined,
      string: latest,
    };
  } catch (error) {
    core.warning("Could not connect to registry: " + error.message);
    return {
      major: 0,
      minor: 0,
      patch: 0,
      beta: false,
      prerelease: undefined,
      string: "0.0.0",
    };
  }
};

async function run() {
  const changePath = core.getInput("changePath");
  try {
    await cmd("git fetch --tags");
    const branch = (await cmd("git", "rev-parse", "HEAD")).trim();
    const previousVersion = await currentVersion();

    core.info(`REPO ${repo} with curren version: ${previousVersion.string}`);

    let tag = "";
    try {
      tag = (
        await cmd(
          "git",
          `describe`,
          `--tags`,
          `--abbrev=0`,
          `--exact-match=v${previousVersion.string}`
        )
      ).trim();
    } catch (err) {
      tag = "";
    }

    core.info(`Tag:\n\t ${tag !== "" ? tag : "NOT FOUND"}`);

    let root;
    if (tag === "") {
      if ((await cmd("git", "remote")) !== "") {
        core.warning(
          "No tags are present for this repository. If this is unexpected, check to ensure that tags have been pulled from the remote."
        );
      }
      // no release tags yet, use the initial commit as the root
      root = "";
    } else {
      // parse the version tag
      root = await cmd("git", `merge-base`, tag, branch);
    }
    root = root.trim();

    let changed = true;

    if (changePath !== "") {
      if (root === "") {
        const changedFiles = await cmd(
          `git log --name-only --oneline ${branch} -- ${changePath}`
        );
        changed = changedFiles.length > 0;
      } else {
        const changedFiles = await cmd(
          `git diff --name-only ${root}..${branch} -- ${changePath}`
        );
        changed = changedFiles.length > 0;
      }
    }

    var logCommand = `git log --pretty="%s" --author-date-order ${
      root === "" ? branch : `${root}..${branch}`
    }`;

    if (changePath !== "") {
      logCommand += ` -- ${changePath}`;
    }

    const log = await cmd(logCommand);
    const logList = log.trim().split("\n");

    const history =
      tag === "" ? logList.slice(0, 1) : logList.reverse();

    if (core.getInput("debugHistory")) {
      core.info(`HISTORY FOR SEARCH: \n\t${history.join("\n\t")}\n`);
    }
    const majorPattern = createMatchTest(
      core.getInput("majorPattern") || "#major"
    );
    const minorPattern = createMatchTest(
      core.getInput("minorPattern") || "#minor"
    );

    const majorIndex = history.findIndex(x => majorPattern(x));
    const minorIndex = history.findIndex(x => minorPattern(x));

    let { major, minor, patch } = previousVersion;
    if (major === 0 && minor === 0 && patch === 0) {
      major = 1;
      core.info("It's a new repo. Let's start with 1.0.0");
    } else if (majorIndex !== -1) {
      major++;
      minor = 0;
      patch = 0;

      core.info("Found the major pattern");
    } else if (minorIndex !== -1) {
      minor++;
      patch = 0;
      core.info("Found the minor pattern");
    } else {
      patch++;
    }

    if (changed) {
      const version = `${major}.${minor}.${patch}`;

      core.info(`\n\nThe new version will be:\n\t${version}`);

      core.setOutput("previousVersion", previousVersion.string);
      core.setOutput("version", version);
      core.setOutput("major", major);
      core.setOutput("minor", minor);
      core.setOutput("patch", patch);
    }

    return;
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

run();

const createMatchTest = pattern => {
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    var regex = new RegExp(pattern.slice(1, -1));
    return l => regex.test(l);
  } else {
    return l => l.includes(pattern);
  }
};
