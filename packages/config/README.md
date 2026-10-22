# @t-jarpis/config

Gedeelde TypeScript- en ESLint-instellingen.

```jsonc
// tsconfig.json
{ "extends": "@t-jarpis/config/tsconfig/node.json" }
```

```js
// eslint.config.js
import base from "@t-jarpis/config/eslint";
export default base;
```
