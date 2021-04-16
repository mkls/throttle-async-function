'use strict';

const LRU = require('lru-cache');
const crypto = require('crypto');
const stringify = require('json-stable-stringify');
const { report } = require('process');
const wait = amount => new Promise(resolve => setTimeout(resolve, amount));

module.exports = (
  asyncFunction,
  {
    cacheRefreshPeriod = 60 * 1000,
    cacheMaxAge = 5 * 60 * 1000,
    maxCachedItems = Infinity,
    retryCount = 0,
    retryDelay = 200,
    hitRateReportPeriod = null,
    hitRateReportHandler = ({ totalCalls, gotThroughCalls }) => {}
  } = {}
) => {
  let hitRateStatistics = { totalCalls: 0, gotThroughCalls: 0 };
  const reportHitRate = () => {
    hitRateReportHandler({ ...hitRateStatistics });
    hitRateStatistics = { totalCalls: 0, gotThroughCalls: 0 };
    setTimeout(reportHitRate, hitRateReportPeriod);
  };
  if (hitRateReportPeriod) {
    setTimeout(reportHitRate, hitRateReportPeriod);
  }

  const promiseCache = new LRU({ max: maxCachedItems, maxAge: cacheRefreshPeriod });
  const resultCache = new LRU({ max: maxCachedItems, maxAge: cacheMaxAge });

  const callWithRetry = async (cacheKey, args, retryCount) => {
    try {
      const result = await asyncFunction(...args);
      resultCache.set(cacheKey, result);
      return result;
    } catch (error) {
      const cachedResult = resultCache.get(cacheKey);
      if (resultCache.has(cacheKey)) {
        return cachedResult;
      }
      if (retryCount > 0) {
        retryDelay !== 0 ? await wait(retryDelay) : null;
        return callWithRetry(cacheKey, args, retryCount - 1);
      } else {
        throw error;
      }
    }
  };

  const throttled = async (...args) => {
    hitRateStatistics.totalCalls += 1;
    const cacheKey = crypto.createHash('md5').update(stringify(args)).digest('hex');

    let cachedPromise = promiseCache.get(cacheKey);
    if (!promiseCache.has(cacheKey) || await isRejected(cachedPromise)) {
      hitRateStatistics.gotThroughCalls += 1;
      cachedPromise = callWithRetry(cacheKey, args, retryCount);
      promiseCache.set(cacheKey, cachedPromise);
    }
    const cachedResult = resultCache.get(cacheKey);
    return resultCache.has(cacheKey) ? cachedResult : cachedPromise;
  };
  throttled.clearCache = () => {
    promiseCache.reset();
    resultCache.reset();
  };
  return throttled;
};

const isRejected = async promise => new Promise(resolve => {
  promise.catch(() => resolve(true));
  setTimeout(() => resolve(false), 0);
});
