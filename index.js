#!/usr/bin/env node

const flowCopySource = require("flow-copy-source");
const fs = require("fs-extra");
const path = require("path");
const uppercamelcase = require("uppercamelcase");
const webpack = require("webpack");
const webpackNodeExternals = require("webpack-node-externals");

async function cwdPath(...parts) {
  const possiblePath = path.join(process.cwd(), ...parts);
  return (await fs.exists(possiblePath)) ? possiblePath : null;
}

async function cwdRequire(file) {
  file = await cwdPath(file);
  return file ? require(file) : null;
}

async function cwdRequireJson(file) {
  file = await cwdPath(file);
  return file ? JSON.parse(await fs.readFile(file)) : null;
}

async function getPkg() {
  return (await cwdRequireJson("package.json")) || {};
}

async function getOptions(overrides) {
  const pkg = await getPkg();
  return {
    ...{
      entry: "./src/index.js",
      externals: webpackNodeExternals(),
      mode: "production",
      module: {
        rules: [{ test: /\.js$/, use: "babel-loader" }]
      },
      output: {
        filename: path.basename(pkg.main || "index.js"),
        library: pkg.name ? uppercamelcase(pkg.name) : undefined,
        libraryTarget: "umd",
        path: path.join(process.cwd(), path.dirname(pkg.main || "dist"))
      }
    },
    ...pkg.zeropack,
    ...(await cwdRequireJson(".zeropackrc")),
    ...(await cwdRequire("zeropack.js")),
    ...overrides
  };
}

function errorOrContinue(yup, nup) {
  return (error, stats) => {
    if (error) {
      nup(error);
      return;
    } else if (stats.hasErrors() || stats.hasWarnings()) {
      const info = stats.toJson();
      nup(console.warn(info.warnings) + console.error(info.errors));
      return;
    } else {
      yup(stats);
    }
  };
}

async function zeropack(optOverrides) {
  const pkg = await getPkg();
  const opt = await getOptions(optOverrides);

  // Cleanup any previous runs.
  await fs.remove(opt.output.path);

  return new Promise((yup, nup) => {
    webpack(
      opt,
      errorOrContinue(nup, () => {
        // If using Flow, copy entry source files ot the output directory.
        if (pkg.devDependencies && pkg.devDependencies["flow-bin"]) {
          const sources = Array.isArray(opt.entry)
            ? Object.values(opt.entry)
            : [opt.entry];
          flowCopySource(sources.map(path.dirname), opt.output.path, {
            ignore: "**/__tests__/**"
          });
        }
        yup();
      })
    );
  });
}

module.exports = { zeropack };