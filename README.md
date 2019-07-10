# eslint-plugin-fix-deps

> An ESLint plugin to add dependencies to packages in monorepos using Bolt or Yarn Workspaces with bolt-check

## Installing

```bash
yarn add eslint-plugin-fix-deps
```

## Getting started

Make your eslint config look kind of like this

```js
module.exports = {
  plugins: ["fix-deps"],
  rules: {
    "fix-deps/no-extraneous-dependencies": ["error", { projectDir: __dirname }]
  }
};
```

## Credit/Inspiration

[@Noviny](https://github.com/Noviny) told me that [@lukebatchelor](https://github.com/lukebatchelor) was going to write a script to add dependencies to `package.json`s in monorepos that apply [Bolt](https://github.com/boltpkg/bolt)'s constraints and I wanted that behaviour as an ESLint rule so I wrote this.

Most of the code here is from [eslint-plugin-import](https://github.com/benmosher/eslint-plugin-import) and some from [get-workspaces](http://npmjs.com/get-workspaces)
