'use strict';

const throttleAsyncFunction = require('./main');
const delay = require('delay');
const fakeTimers = require('@sinonjs/fake-timers');

describe('throttleAsyncFunction', () => {
  it('should return the result of the function for the first execution', async () => {
    const throttled = throttleAsyncFunction(async () => 2);

    const result = await throttled();

    expect(result).toEqual(2);
  });

  it('should pass parameters to the wrapped function', async () => {
    const asyncFunction = jest.fn().mockResolvedValue();
    const throttled = throttleAsyncFunction(asyncFunction);

    await throttled(8, 'kismacska');

    expect(asyncFunction).toHaveBeenCalledWith(8, 'kismacska');
  });

  it('should only call wrapped function once if called multiple times within refresh period', async () => {
    const asyncFunction = jest.fn().mockResolvedValue(2);
    const throttled = throttleAsyncFunction(asyncFunction);

    const result1 = await throttled();
    const result2 = await throttled();

    expect([result1, result2]).toEqual([2, 2]);
    expect(asyncFunction).toHaveBeenCalledTimes(1);
  });

  it('should call wrapped function multiple times for different arguments', async () => {
    const asyncFunction = jest.fn().mockImplementation(async arg => (arg > 2 ? true : false));
    const throttled = throttleAsyncFunction(asyncFunction);

    const result1 = await throttled(1);
    const result2 = await throttled(4);

    expect([result1, result2]).toEqual([false, true]);
    expect(asyncFunction).toHaveBeenCalledTimes(2);
  });

  it('should return cached result when parameters of call are deep equal', async () => {
    const asyncFunction = jest.fn().mockResolvedValue(2);
    const throttled = throttleAsyncFunction(asyncFunction);

    const result1 = await throttled({ a: 1, b: 2 });
    const result2 = await throttled({ b: 2, a: 1 });

    expect([result1, result2]).toEqual([2, 2]);
    expect(asyncFunction).toHaveBeenCalledTimes(1);
  });

  it('should execute wrapped function again after refresh period', async () => {
    const cacheRefreshPeriod = 100;
    const asyncFunction = jest.fn().mockResolvedValue(3);
    const throttled = throttleAsyncFunction(asyncFunction, { cacheRefreshPeriod });

    await throttled();
    await throttled();
    await delay(cacheRefreshPeriod + 10);
    await throttled();

    expect(asyncFunction).toHaveBeenCalledTimes(2);
  });

  it('should not call wrapped function twice for new call while previous call is still in progress', async () => {
    let resolvePromise;
    const asyncFunction = jest
      .fn()
      .mockImplementation(() => new Promise(resolve => (resolvePromise = resolve)));
    const throttled = throttleAsyncFunction(asyncFunction);

    const promise1 = throttled();
    const promise2 = throttled();

    expect(asyncFunction).toHaveBeenCalledTimes(1);

    resolvePromise(12);
    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect([result1, result2]).toEqual([12, 12]);
  });

  it('should return previous result from cache if a new refresh is still in progress', async () => {
    const cacheRefreshPeriod = 100;
    let resolveSecondCall;
    const asyncFunction = jest
      .fn()
      .mockImplementationOnce(async () => 'firstResult')
      .mockImplementationOnce(async () => new Promise(resolve => (resolveSecondCall = resolve)));
    const throttled = throttleAsyncFunction(asyncFunction, { cacheRefreshPeriod });

    const firstResultFillCache = await throttled();
    expect(firstResultFillCache).toEqual('firstResult');

    await delay(cacheRefreshPeriod + 10);

    const secondCallResult = await throttled();
    expect(secondCallResult).toEqual('firstResult');

    resolveSecondCall('secondResult');
    await delay(0);

    const thirdCallResult = await throttled();
    expect(thirdCallResult).toEqual('secondResult');
  });

  it('should not throw error when wrapped function fail and cached value is falsy', async () => {
    const cacheRefreshPeriod = 100;
    const asyncFunction = jest.fn().mockResolvedValueOnce(null).mockRejectedValue(new Error('ops'));
    const throttled = throttleAsyncFunction(asyncFunction, { cacheRefreshPeriod });

    await throttled();
    await delay(cacheRefreshPeriod + 5);
    const resultAfterError = await throttled();

    expect(resultAfterError).toEqual(null);
  });

  it('should throw if wrapped function fails for the first time for given args', async () => {
    const asyncFunction = () => {
      throw new Error('error from asyncFunction');
    };
    const throttled = throttleAsyncFunction(asyncFunction);

    await expect(throttled()).rejects.toThrowError('error from asyncFunction');
  });

  it('should return latest non expired result when wrapped function failed', async () => {
    const cacheRefreshPeriod = 100;
    const asyncFunction = jest
      .fn()
      .mockResolvedValueOnce(14)
      .mockRejectedValueOnce(new Error('things are bad, but we have cache'));
    const throttled = throttleAsyncFunction(asyncFunction, { cacheRefreshPeriod });

    await throttled();
    await delay(cacheRefreshPeriod + 10);
    const secondResult = await throttled();

    expect(secondResult).toEqual(14);
  });

  it('should throw if latest successful wrapped function call was before expiration time', async () => {
    const cacheRefreshPeriod = 50;
    const cacheMaxAge = 100;
    const asyncFunction = jest
      .fn()
      .mockResolvedValueOnce(14)
      .mockRejectedValueOnce(new Error('pesky persistent error'));
    const throttled = throttleAsyncFunction(asyncFunction, { cacheRefreshPeriod, cacheMaxAge });

    await throttled();
    await delay(cacheMaxAge + 10);

    await expect(throttled()).rejects.toThrowError('pesky persistent error');
  });

  describe('retryCount option', () => {
    it('should retry if wrapped function fails for the first call for given args', async () => {
      const asyncFunction = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient error'))
        .mockResolvedValueOnce(14);
      const throttled = throttleAsyncFunction(asyncFunction, { retryCount: 1 });

      const result = await throttled();

      expect(result).toEqual(14);
    });

    it('should not retry failed wrapped function if there is valid cached result', async () => {
      const cacheRefreshPeriod = 100;
      const asyncFunction = jest
        .fn()
        .mockResolvedValueOnce(14)
        .mockRejectedValueOnce(new Error('transient error'));
      const throttled = throttleAsyncFunction(asyncFunction, {
        cacheRefreshPeriod,
        retryCount: 1
      });

      await throttled();
      await delay(cacheRefreshPeriod + 10);
      const result = await throttled();
      await delay(5);

      expect(result).toEqual(14);
      expect(asyncFunction).toHaveBeenCalledTimes(2);

      const resultAfterFailedRefresh = await throttled();
      expect(resultAfterFailedRefresh).toEqual(14);
    });

    it('should retry if wrapped function fails while cache is expired', async () => {
      const cacheRefreshPeriod = 50;
      const cacheMaxAge = 100;
      const asyncFunction = jest
        .fn()
        .mockResolvedValueOnce(14)
        .mockRejectedValueOnce(new Error('pesky persistent error'))
        .mockResolvedValueOnce(16);
      const throttled = throttleAsyncFunction(asyncFunction, {
        cacheRefreshPeriod,
        cacheMaxAge,
        retryCount: 1
      });

      await throttled();
      await delay(cacheMaxAge + 10);
      const result = await throttled();

      expect(result).toEqual(16);
      expect(asyncFunction).toHaveBeenCalledTimes(3);
    });

    it('should throw error if retry count is exhausted and request still fails', async () => {
      const asyncFunction = jest.fn().mockRejectedValue(new Error('pesky persistent error'));
      const throttled = throttleAsyncFunction(asyncFunction, { retryCount: 3 });

      await expect(throttled()).rejects.toThrowError('pesky persistent error');
      expect(asyncFunction).toHaveBeenCalledTimes(4);
    });
  });

  describe('maxCachedItems', () => {
    it('should remove least recently accesed items from cache when above limit', async () => {
      const asyncFunction = jest.fn().mockResolvedValue(14);
      const throttled = throttleAsyncFunction(asyncFunction, { maxCachedItems: 2 });

      await throttled(1);
      await throttled(2);
      await throttled(3);
      await throttled(1);

      expect(asyncFunction).toBeCalledTimes(4);
    });
  });

  describe('hitRateReport', () => {
    it('should call hitRateReportHandler every hitRateReportPeriod ms if set with statistics', async () => {
      const clock = fakeTimers.install();
      const hitRateReportPeriod = 400;
      const hitRateReportHandler = jest.fn();
      const throttled = throttleAsyncFunction(() => 1, {
        hitRateReportPeriod,
        hitRateReportHandler
      });

      await throttled(1);
      await throttled(1);
      await throttled(2);
      clock.tick(hitRateReportPeriod + 1);

      expect(hitRateReportHandler.mock.calls).toEqual([[{ totalCalls: 3, gotThroughCalls: 2 }]]);

      await throttled(1);
      clock.tick(hitRateReportPeriod + 1);

      expect(hitRateReportHandler.mock.calls).toEqual([
        [{ totalCalls: 3, gotThroughCalls: 2 }],
        [{ totalCalls: 1, gotThroughCalls: 0 }]
      ]);
      clock.uninstall();
    });
  });

  describe('clearCache', () => {
    it('should call wrapped function again after clearCache was called', async () => {
      const asyncFunction = jest.fn();
      const throttled = throttleAsyncFunction(asyncFunction);

      await throttled();
      throttled.clearCache();
      await throttled();

      expect(asyncFunction).toBeCalledTimes(2);
    });
  });
});
