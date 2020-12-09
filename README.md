# probabilistic-forecast

Jira plugin for probabilistic forecasting

## Install

```
npm ci
```

## Run

```
JSESSIONID=ABCDEF012345ABCDEF012345ABCDEF01 npm run start
```

`JSESSIONID` is from your Jira cookies. TODO: Can we use API tokens instead?

## Debug

```
NODE_OPTIONS="--inspect-brk" JSESSIONID=ABCDEF012345ABCDEF012345ABCDEF01 npm run start
```

Then open Chrome dev tools and click the NodeJS icon.
