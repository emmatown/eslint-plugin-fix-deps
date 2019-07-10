// @flow weak
import path from "path";
import fs from "fs";
import { isArray, isEmpty } from "lodash";
import readPkgUp from "read-pkg-up";
import minimatch from "minimatch";
import resolve from "eslint-module-utils/resolve";
import importType from "../importType";
import isStaticRequire from "../staticRequire";
import getWorkspaces from "../get-workspaces";

function hasKeys(obj = {}) {
  return Object.keys(obj).length > 0;
}

function extractDepFields(pkg) {
  return {
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
    optionalDependencies: pkg.optionalDependencies || {},
    peerDependencies: pkg.peerDependencies || {}
  };
}

function getDependencies(context, packageDir) {
  let paths = [];
  try {
    const packageContent = {
      dependencies: {},
      devDependencies: {},
      optionalDependencies: {},
      peerDependencies: {}
    };

    // use closest package.json
    Object.assign(
      packageContent,
      extractDepFields(
        readPkgUp.sync({ cwd: context.getFilename(), normalize: false }).pkg
      )
    );

    if (
      ![
        packageContent.dependencies,
        packageContent.devDependencies,
        packageContent.optionalDependencies,
        packageContent.peerDependencies
      ].some(hasKeys)
    ) {
      return null;
    }

    return packageContent;
  } catch (e) {
    if (!isEmpty(paths) && e.code === "ENOENT") {
      context.report({
        message: "The package.json file could not be found.",
        loc: { line: 0, column: 0 }
      });
    }
    if (e.name === "JSONError" || e instanceof SyntaxError) {
      context.report({
        message: "The package.json file could not be parsed: " + e.message,
        loc: { line: 0, column: 0 }
      });
    }

    return null;
  }
}

function devDepErrorMessage(packageName) {
  return `'${packageName}' should be listed in the package's dependencies, not devDependencies.`;
}

function optDepErrorMessage(packageName) {
  return (
    `'${packageName}' should be listed in the package's dependencies, ` +
    `not optionalDependencies.`
  );
}

function reportIfMissing(context, deps, depsOptions, node, name) {
  // Do not report when importing types
  if (node.importKind === "type") {
    return;
  }

  if (importType(name, context) !== "external") {
    return;
  }

  const resolved = resolve(name, context);
  if (!resolved) {
    return;
  }

  const splitName = name.split("/");
  const packageName =
    splitName[0][0] === "@" ? splitName.slice(0, 2).join("/") : splitName[0];
  const isInDeps = deps.dependencies[packageName] !== undefined;
  const isInDevDeps = deps.devDependencies[packageName] !== undefined;
  const isInOptDeps = deps.optionalDependencies[packageName] !== undefined;
  const isInPeerDeps = deps.peerDependencies[packageName] !== undefined;

  if (
    isInDeps ||
    (depsOptions.allowDevDeps && isInDevDeps) ||
    (depsOptions.allowPeerDeps && isInPeerDeps) ||
    (depsOptions.allowOptDeps && isInOptDeps)
  ) {
    return;
  }

  // todo: improve all the things

  if (isInDevDeps && !depsOptions.allowDevDeps) {
    context.report(node, devDepErrorMessage(packageName));
    return;
  }

  if (isInOptDeps && !depsOptions.allowOptDeps) {
    context.report(node, optDepErrorMessage(packageName));
    return;
  }
  let filename = context.getFilename();
  let rootPkg = extractDepFields(
    JSON.parse(
      fs.readFileSync(path.join(depsOptions.projectDir, "package.json"), "utf8")
    )
  );

  let rootDepVersion =
    rootPkg.dependencies[packageName] === undefined
      ? rootPkg.devDependencies[packageName]
      : rootPkg.dependencies[packageName];
  let isDepInRoot = rootDepVersion !== undefined;

  let { pkg, path: pkgPath } = readPkgUp.sync({
    cwd: filename,
    normalize: false
  });
  let workspaces = getWorkspaces({ cwd: depsOptions.projectDir });

  let workspace = workspaces.find(workspace => {
    return workspace.name === packageName;
  });

  context.report({
    node,
    message:
      isDepInRoot || workspace
        ? `'${packageName}' should be listed in the package's dependencies.`
        : `'${packageName}' should be listed in the project and package's dependencies.`,
    fix() {
      // yes,
      // i know this is probably bad
      // but it works so ¯\_(ツ)_/¯
      if (isDepInRoot || workspace) {
        // we want to read it again in case it's been modified since the rule was run
        let pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        // i want to special case react because it's a really common case
        if (packageName === "react" || packageName === "react-dom") {
          if (!pkg.peerDependencies) {
            pkg.peerDependencies = {};
          }
          pkg.peerDependencies[packageName] = rootDepVersion;
          if (!pkg.devDependencies) {
            pkg.devDependencies = {};
          }
          pkg.devDependencies[packageName] = rootDepVersion;
        } else {
          pkg.dependencies[packageName] =
            rootDepVersion === undefined
              ? "^" + workspace.config.version
              : rootDepVersion;
        }
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      }
    }
  });
}

function testConfig(config, filename) {
  // Simplest configuration first, either a boolean or nothing.
  if (typeof config === "boolean" || typeof config === "undefined") {
    return config;
  }
  // Array of globs.
  return config.some(
    c =>
      minimatch(filename, c) || minimatch(filename, path.join(process.cwd(), c))
  );
}
module.exports = {
  meta: {
    type: "problem",
    docs: {
      url: `https://github.com/mitchellhamilton/eslint-plugin-fix-deps/blob/master/docs/rules/no-extraneous-dependencies.md`
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          devDependencies: { type: ["boolean", "array"] },
          optionalDependencies: { type: ["boolean", "array"] },
          peerDependencies: { type: ["boolean", "array"] },
          packageDir: { type: ["string", "array"] },
          projectDir: { type: "string" }
        },
        required: ["projectDir"],
        additionalProperties: false
      }
    ]
  },

  create: function(context) {
    const options = context.options[0] || {};
    const filename = context.getFilename();
    const deps =
      getDependencies(context, options.packageDir) || extractDepFields({});

    const depsOptions = {
      allowDevDeps: testConfig(options.devDependencies, filename) !== false,
      allowOptDeps:
        testConfig(options.optionalDependencies, filename) !== false,
      allowPeerDeps: testConfig(options.peerDependencies, filename) !== false,
      projectDir: options.projectDir
    };

    // todo: use module visitor from module-utils core
    return {
      ImportDeclaration: function(node) {
        reportIfMissing(context, deps, depsOptions, node, node.source.value);
      },
      CallExpression: function handleRequires(node) {
        if (isStaticRequire(node)) {
          reportIfMissing(
            context,
            deps,
            depsOptions,
            node,
            node.arguments[0].value
          );
        }
      }
    };
  }
};
