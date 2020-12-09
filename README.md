# probabilistic-forecast

Jira plugin for probabilistic forecasting

## Install

```
npm ci
```

## Run

```
JSESSIONID=ABCDEF012345ABCDEF012345ABCDEF01 ./forecast.js
```

`JSESSIONID` is from your Jira cookies. TODO: Can we use API tokens instead?

## Debug

```
NODE_OPTIONS="--inspect-brk" JSESSIONID=ABCDEF012345ABCDEF012345ABCDEF01 ./forecast.js
```

Then open Chrome dev tools and click the NodeJS icon.
