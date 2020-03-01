'use strict';

const LRU = require('lru-cache');

module.exports = (
  asyncFunction,
  {
    cacheRefreshPeriod = 60 * 1000,
    cacheExpiry = 5 * 60 * 1000,
    maxCachedItems = Infinity,
    retryCount = 0
  } = {}
) => {
  const promiseCache = new LRU({ max: maxCachedItems, maxAge: cacheRefreshPeriod });
  const resultCache = new LRU({ max: maxCachedItems, maxAge: cacheExpiry });

  const setPromiseCacheForArgs = (cacheKey, args) => {
    const promise = retry(async () => asyncFunction(...args), retryCount)
      .then(result => {
        resultCache.set(cacheKey, result);
        return result;
      })
      .catch(error => {
        if (resultCache.has(cacheKey)) {
          return resultCache.get(cacheKey);
        }
        throw error;
      });
    promiseCache.set(cacheKey, promise);
  };

  const throttled = async (...args) => {
    const cacheKey = JSON.stringify(args);

    if (!promiseCache.has(cacheKey)) {
      setPromiseCacheForArgs(cacheKey, args);
    }
    if (resultCache.has(cacheKey)) {
      return resultCache.get(cacheKey);
    }
    return promiseCache.get(cacheKey);
  };
  throttled.clearCache = () => {
    promiseCache.reset();
    resultCache.reset();
  };
  return throttled;
};

const retry = async (operation, retryCount) => {
  try {
    return await operation();
  } catch (error) {
    if (retryCount > 0) {
      return retry(operation, retryCount - 1);
    } else {
      throw error;
    }
  }
};
