const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-contacts ships TypeScript source and points `main` at "src/index.ts".
// Metro appends its own extensions to that path and finds nothing, so it has to
// read the package's "exports" map instead.
config.resolver.unstable_enablePackageExports = true;

// expo-sqlite ships its web build as WebAssembly. It must be served verbatim:
// listing it under sourceExts instead sends the binary through Babel, which
// fails to parse it.
if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}

module.exports = config;
