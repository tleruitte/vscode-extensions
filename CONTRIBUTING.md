# Contributing

Each extension is a folder of this repository with its own `package.json` and version. Run the commands below in the folder of the extension.

## Development

1. Clone this repository and open its folder in VS Code.

2. Install the dependencies of the extension:

   ```bash
   cd <extension>
   npm install
   ```

3. Compile TypeScript once, or watch for changes:

   ```bash
   npm run compile
   ```

   ```bash
   npm run watch
   ```

4. Run the extension in an Extension Development Host: open **Run and Debug**, choose **Run \<extension\>**, and press F5. A new VS Code window opens with the extension loaded.

5. In that window, follow **How to use** in the README of the extension.

## Package

Build a `.vsix` you can install locally:

```bash
cd <extension>
npm install
npm run package
```

This runs [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce) via `npx` and writes `<extension>/releases/<extension>-<version>.vsix` (version from `package.json`).

Install the VSIX in VS Code: **Extensions** view → **⋯** menu → **Install from VSIX…** and select the file.

## Publish a new version to Open VSX

A tag named `<extension>-v<version>` (for example `open-on-github-v0.1.7`) makes GitHub publish that extension to Open VSX (see [`.github/workflows/release.yml`](.github/workflows/release.yml)). The workflow uses the `OVSX_PAT` secret of the repository: an [Open VSX personal access token](https://open-vsx.org/user-settings/tokens) of the `tleruitte` publisher.

1. From a clean `main`, upgrade the version of the extension using [semantic versioning](https://semver.org/):

   ```bash
   scripts/release.sh <extension> patch
   ```

   Use `minor` or `major` instead of `patch` when appropriate. This updates the version in the `package.json` and `package-lock.json` of the extension, then creates a Git commit and the tag.

2. Push the version commit and tag:

   ```bash
   git push origin main --follow-tags
   ```

3. Follow the **Release** run in the **Actions** tab of the repository.

The `v0.1.x` tags from before the repository held several extensions are the releases of Open on GitHub.
