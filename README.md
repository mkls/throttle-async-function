# throttle-async-function

Cache the results of async function calls.

You can wrap your async function with this package and calls to the
wrapped version only get excecuted if there is no recent result for the same arguments in
cache, thus it thottles the execution of you function.

It could have been a good idea to include caching or memoizing in the name, since what
this package does is related to those concepts as well.

## Usage

The package exposes a factory function which creates a wrapped version of the passed in
function:

```js
const throttleAsyncFunction = require('throttleAsyncFunction');

const throttled = throttleAsyncFunction(
  async userId => await fetchUserInfo(userId),
  {
    cacheRefreshPeriod: 10 * 1000,
    cacheMaxAge: 60 * 1000,
    retryCount: 2
  }
);

await throttled(14);  // calls wrapped function
await throttled(14);  // does not, returns result from cache
await throttled(3);   // calls wrapped function again, no cache for this argument
```

### Options

- `cacheRefreshPeriod`: in milliseconds, default: 60000 millisecond (1 minute)

  The wrapped function will be called at most after this much wait with the same parameter.
  Similar to the `wait` paramters of lodash\`s `throttle` function.

- `cacheMaxAge`: in milliseconds, default is 300000 millisecond (5 minutes)

  Cached result will expire when they are oldar than this value. Should be a larger value than `cacheRefreshPeriod`.

With the default values of `cacheRefreshPeriod` and `cacheMaxAge` (1 and 5 minutes)
it will try to refresh the cache every 1 minute for given arguments, but in case
this refresh fails (after retries), it will serve the result of the latest
succesfull refresh until it is less than 5 minutes old.

- `retryCount`: (default 0)

  When the wrapped function returns with a rejected promise or throws an error, it will
  be retried this many times before propagating the error to the caller.


### Resetting cache

In integration tests you probably don't want to keep the cache between test cases,
otherwise it would introduce add hidden coupling between the cases.

For this reaseon there is a `clearCache` method on the throttled function which resets its
state. You can call this in a `beforeEach` of your tests.

```js
const throttled = throttleAsyncFunction(async id => await getUser(id));

await throttled(12);
throttled.clearCache();
await throttled(12);    // calls wrapped function again
```