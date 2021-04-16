# throttle-async-function

Cache the results of async function calls.

You can wrap your async function with this package and cache it's recent results.
Calls to the wrapped version only get executed if there is no result for the same arguments
in cache. With this it throttles the execution of you function.

It could have been a good idea to include caching or memoizing in the name, since what
this package does is related to those concepts as well.

## Usage

The package exposes a factory function which creates a wrapped version of the passed in
function:

```js
const throttleAsyncFunction = require('throttle-async-function');

const throttled = throttleAsyncFunction(
  async userId => await fetchUserInfo(userId),
  {
    cacheRefreshPeriod: 10 * 1000,
    cacheMaxAge: 60 * 1000,
    maxCachedItems: 1000
    retryCount: 2
  }
);

await throttled(14);  // calls wrapped function
await throttled(14);  // does not, returns result from cache
await throttled(3);   // calls wrapped function again, no cache for this argument
```

### Options

- `cacheRefreshPeriod`: in milliseconds, default: 60000 millisecond (1 minute)

  The wrapped function will be called after this much wait for the same parameters, to refresh
  the cache.
  Since we don't want to cache failed exections, the wrapped function will be called before this
  wait time if the previous execution failed.
  Similar to the `wait` paramters of lodash\`s `throttle` function.

- `cacheMaxAge`: in milliseconds, default is 300000 millisecond (5 minutes)

  Cached result will expire when they are oldar than this value.
  Should be a larger value than `cacheRefreshPeriod`.

With the default values of `cacheRefreshPeriod` and `cacheMaxAge` (1 and 5 minutes)
it will try to refresh the cache every 1 minute for given arguments, but in case
the refresh fails, it will serve the result of the latest succesfull refresh until it is
no more than 5 minutes old.

- `maxCachedItems`: default is `Infinity` (no limit)

  The maximum number of results to store before evicting the least recently used one.
  Uses [lru-cache](https://www.npmjs.com/package/lru-cache) behind the scene.

- `retryCount`: default is 0 (no retry)

  When the wrapped function returns with a rejected promise or throws an error, it will
  be retried this many times before propagating the error to the caller.
  Unless, there is a valid value for this value in cache, in which case it does not
  bother with retries. Waits 200ms between retries.

- `retryDelay`: in milliseconds, default: 200 millisecond

  The amount of time to wait before executing the next retry

- `hitRateReportPeriod`: in milliseconds, default is `null`, meananing no hitRateReportHandler

  Sets how often the `hitRateReportHandler` callback should be called.
  With the default `null` value the callback is never called.

- `hitRateReportHandler`

  Called periodically with the count number of total calls made to the wrapper (`totalCount`)
  and the number of calls actually sent through to the wrapped function (`gotThroughCalls`),
  since the last report.

### Resetting cache

In integration tests, you probably don't want to keep the cache between test cases,
since it would add hidden coupling between the test cases.

For this reaseon there is a `clearCache` method on the throttled function which resets its
state. You can call this in a `beforeEach` of your tests.

```js
const throttled = throttleAsyncFunction(async id => await getUser(id));

await throttled(12);
throttled.clearCache();
await throttled(12);    // calls wrapped function again
```

### Motivation

Compared with similar packages I believe this packege let's you set up a more
error resistent in memory caching.

The initial version of this was package was lifted out from a system where we
were on-call 24/7, and it was rather annoying to wake up for a single failed request.
This was an attempt to use caching and retries to ensure our systems works
when there are transient errors in other services we are calling.

I would suggest the following setup for similar use-cases:

```js
const throttledFetchEventUsage = throttleAsyncFunction(
  async customerId => {
    try {
      return await fetchEventUsage(customerId);
    } catch (error) {
      logger.warn('event-usage-fetch-faield');
      throw error;
    }
  },
  { retryCount: 2 }
);

try {
  const usage = await throttledFetchEventUsage(customerId);
} catch (error) {
  logger.error('event-usage-fetch-failed-after-retries');
}
```

The first `warning` log logs every failed request, even if the failure was mitigated by
retries or there was cache available. This let's you look at the general health of
this operation, but you do not need to alert for this log.

The second `error` log logs when the mitigation strategies failed.
You can connect a high prio alert for this log.
