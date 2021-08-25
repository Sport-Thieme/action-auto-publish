
# Sport-Thieme Auto Publish

This action is inspired and reusing code from the awesome [Paul Hatch's semantic-version](https://github.com/PaulHatch/semantic-version). I did not forked, because of renaming it to our conventions and doing the versioning part by package versions instead of tags.

It's doing a diff between the tag matching the current package version and determines based on patterns if it should publish major, minor or patch.

# Usage:

```yml
name: The name

on:
  push:
    branches: [master]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v2
        with:
          node-version: "12.x"
          registry-url: "https://npm.pkg.github.com"

      - name: "setup git config"
        run: |
          # setup the username and email. I tend to use 'GitHub Actions Bot' with no email by default
          git config user.name "GitHub Actions Bot"
          git config user.email "<>"

      - name: "Use this action"
        id: versioning
        uses: Sport-Thieme/action-next-package-version@v1.0.0
        with:
          # A string which, if present in a git commit, indicates that a change  represents a
          # major (breaking) change, supports regular expressions wrapped with '/'
          majorPattern: "#major"
          # Same as above except indicating a minor change, supports regular expressions wrapped with '/'
          minorPattern: "#minor"
          # You can choose to use latest or if false the action takes the last published version (any version)
          useLatest: true
        env:
          # Important this action needs to have access to your registry.
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    
      - name: "Publish to registry"
        run: yarn publish --new-version ${{steps.versioning.outputs.version}} --non-interactive
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: "Push Tags" 
        run: git push origin master --tags  
```

# Outputs

- **previousVersion** based on the package version. This could be latest or the last published version. See **useLatest**
- **version** is the new version for publishing
- **major**, **minor** and **patch** provide the version numbers that have been determined for this commit