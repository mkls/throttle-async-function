'use strict';

module.exports = ({
  asyncFunction,
  cacheRefreshPeriodMs = 60 * 1000,
  cacheExpiryMs = 10 * 60 * 1000,
  retryCount = 0
}) => {
  let promiseCache = {};
  let resultCache = {};

  const shouldRefresh = timestamp => Date.now() - timestamp > cacheRefreshPeriodMs;
  const isExpired = timestamp => Date.now() - timestamp > cacheExpiryMs;
  const hasValidCachedResultFor = cacheKey => {
    const cachedResult = resultCache[cacheKey];
    return cachedResult && !isExpired(cachedResult.timestamp);
  };
  const refreshPromiseIfExpired = (cacheKey, args) => {
    const cachedPromise = promiseCache[cacheKey];
    if (cachedPromise && !shouldRefresh(cachedPromise.timestamp)) {
      return;
    }
    const promise = retryFunction(async () => asyncFunction(...args), retryCount)
      .then(result => {
        resultCache[cacheKey] = { result, timestamp: Date.now() };
        return result;
      })
      .catch(error => {
        if (hasValidCachedResultFor(cacheKey)) return resultCache[cacheKey].result;
        throw error;
      });
    promiseCache[cacheKey] = { promise, timestamp: Date.now() };
  };

  return {
    async call(...args) {
      const cacheKey = JSON.stringify(args);

      refreshPromiseIfExpired(cacheKey, args);

      if (hasValidCachedResultFor(cacheKey)) return resultCache[cacheKey].result;
      return promiseCache[cacheKey].promise;
    },
    clearCache() {
      promiseCache = {};
      resultCache = {};
    }
  };
};

const retryFunction = async (operation, retryCount) => {
  try {
    return await operation();
  } catch (error) {
    if (retryCount > 0) {
      return retryFunction(operation, retryCount - 1);
    } else {
      throw error;
    }
  }
};
