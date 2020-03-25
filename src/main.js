'use strict';

const LRU = require('lru-cache');
const crypto = require('crypto');

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

  const callWithRetry = async (cacheKey, args, retryCount) => {
    try {
      const result = await asyncFunction(...args);
      resultCache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (resultCache.has(cacheKey)) {
        return resultCache.get(cacheKey);
      }
      if (retryCount > 0) {
        return callWithRetry(cacheKey, args, retryCount - 1);
      } else {
        throw error;
      }
    }
  };

  const throttled = async (...args) => {
    const cacheKey = crypto
      .createHash('md5')
      .update(JSON.stringify(args))
      .digest('hex');

    if (!promiseCache.has(cacheKey)) {
      promiseCache.set(cacheKey, callWithRetry(cacheKey, args, retryCount));
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
