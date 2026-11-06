import fs from "node:fs";
import path from "node:path";

// parse target version from cli args or semver bump keyword
const args = process.argv.slice(2);
const input = args[0]?.trim();

if (!input) {
  console.error("Usage: bun run bump-version <new-version | patch | minor | major>");
  process.exit(1);
}

const rootDir = process.cwd();

// helper to read and parse json
function readJson(relPath: string) {
  const fullPath = path.join(rootDir, relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

// helper to write formatted json
function writeJson(relPath: string, data: unknown) {
  const fullPath = path.join(rootDir, relPath);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// resolve current version from root package.json or client package.json
const rootPkg = readJson("package.json");
const clientPkg = readJson("apps/client/package.json");
const currentVersion = rootPkg.version || clientPkg.version || "0.2.2";

function computeNextVersion(current: string, bumpType: string): string {
  const parts = current.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Invalid semver version: ${current}`);
  }

  let [major, minor, patch] = parts;
  if (bumpType === "patch") {
    patch += 1;
  } else if (bumpType === "minor") {
    minor += 1;
    patch = 0;
  } else if (bumpType === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (/^\d+\.\d+\.\d+/.test(bumpType)) {
    return bumpType;
  } else {
    throw new Error(`Unrecognized version or bump type: ${bumpType}`);
  }

  return `${major}.${minor}.${patch}`;
}

const targetVersion = computeNextVersion(currentVersion, input);
console.log(`Bumping version from ${currentVersion} -> ${targetVersion}...\n`);

const touchedFiles: string[] = [];

// 1. root package.json
rootPkg.version = targetVersion;
writeJson("package.json", rootPkg);
touchedFiles.push("package.json");

// 2. apps/client/package.json
clientPkg.version = targetVersion;
writeJson("apps/client/package.json", clientPkg);
touchedFiles.push("apps/client/package.json");

// 3. packages/ui/package.json
const uiPkg = readJson("packages/ui/package.json");
uiPkg.version = targetVersion;
writeJson("packages/ui/package.json", uiPkg);
touchedFiles.push("packages/ui/package.json");

// 4. packages/player-model/package.json
const playerModelPkg = readJson("packages/player-model/package.json");
playerModelPkg.version = targetVersion;
writeJson("packages/player-model/package.json", playerModelPkg);
touchedFiles.push("packages/player-model/package.json");

// 5. packages/ui/src/settings.ts
const settingsPath = path.join(rootDir, "packages/ui/src/settings.ts");
let settingsContent = fs.readFileSync(settingsPath, "utf-8");
settingsContent = settingsContent.replace(
  /export const APP_VERSION = ".*?";/,
  `export const APP_VERSION = "${targetVersion}";`,
);
fs.writeFileSync(settingsPath, settingsContent, "utf-8");
touchedFiles.push("packages/ui/src/settings.ts");

// 6. mygo.config.ts
const mygoConfigPath = path.join(rootDir, "mygo.config.ts");
let mygoConfigContent = fs.readFileSync(mygoConfigPath, "utf-8");
mygoConfigContent = mygoConfigContent.replace(/version:\s*".*?",/, `version: "${targetVersion}",`);
fs.writeFileSync(mygoConfigPath, mygoConfigContent, "utf-8");
touchedFiles.push("mygo.config.ts");

// 7. internal/discovery/discovery.go user agent
const discoveryGoPath = path.join(rootDir, "internal/discovery/discovery.go");
let discoveryGoContent = fs.readFileSync(discoveryGoPath, "utf-8");
discoveryGoContent = discoveryGoContent.replace(
  /SeraLauncher\/\d+\.\d+\.\d+/g,
  `SeraLauncher/${targetVersion}`,
);
fs.writeFileSync(discoveryGoPath, discoveryGoContent, "utf-8");
touchedFiles.push("internal/discovery/discovery.go");

// 8. internal/minecraft/launcher.go user agent
const launcherGoPath = path.join(rootDir, "internal/minecraft/launcher.go");
let launcherGoContent = fs.readFileSync(launcherGoPath, "utf-8");
launcherGoContent = launcherGoContent.replace(
  /SeraLauncher\/\d+\.\d+\.\d+/g,
  `SeraLauncher/${targetVersion}`,
);
fs.writeFileSync(launcherGoPath, launcherGoContent, "utf-8");
touchedFiles.push("internal/minecraft/launcher.go");

// 9. CHANGELOG.md
const changelogPath = path.join(rootDir, "CHANGELOG.md");
if (fs.existsSync(changelogPath)) {
  let changelogContent = fs.readFileSync(changelogPath, "utf-8");
  if (!changelogContent.includes(`## [${targetVersion}]`)) {
    const today = new Date().toISOString().slice(0, 10);
    const newSection = `## [${targetVersion}] - ${today}\n\n### Changed\n- Version bump to ${targetVersion}\n\n`;
    changelogContent = changelogContent.replace(/(## \[\d+\.\d+\.\d+\])/, `${newSection}$1`);
    fs.writeFileSync(changelogPath, changelogContent, "utf-8");
    touchedFiles.push("CHANGELOG.md");
  }
}

console.log(`Successfully updated ${touchedFiles.length} files:`);
for (const file of touchedFiles) {
  console.log(`  - ${file}`);
}
console.log(
  `\nVersion successfully bumped to ${targetVersion}. Run 'bun install' to synchronize lockfile.`,
);
