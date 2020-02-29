'use strict';

const throttleAsyncFunction = require('./main');
const delay = require('delay');

describe('throttleAsyncFunction', () => {
  it('should return the result of the function for the first execution', async () => {
    const throttled = throttleAsyncFunction({ asyncFunction: async () => 2 });

    const result = await throttled.call();

    expect(result).toEqual(2);
  });

  it('should pass parameters to the wrapped function', async () => {
    const asyncFunction = jest.fn().mockResolvedValue();
    const throttled = throttleAsyncFunction({ asyncFunction });

    await throttled.call(8, 'kismacska');

    expect(asyncFunction).toHaveBeenCalledWith(8, 'kismacska');
  });

  it('should only call wrapped function once if called multiple times within refresh period', async () => {
    const asyncFunction = jest.fn().mockResolvedValue(2);
    const throttled = throttleAsyncFunction({ asyncFunction });

    const result1 = await throttled.call();
    const result2 = await throttled.call();

    expect([result1, result2]).toEqual([2, 2]);
    expect(asyncFunction).toHaveBeenCalledTimes(1);
  });

  it('should call wrapped function multiple times for different arguments', async () => {
    const asyncFunction = jest.fn().mockImplementation(async arg => (arg > 2 ? true : false));
    const throttled = throttleAsyncFunction({ asyncFunction });

    const result1 = await throttled.call(1);
    const result2 = await throttled.call(4);

    expect([result1, result2]).toEqual([false, true]);
    expect(asyncFunction).toHaveBeenCalledTimes(2);
  });

  it('it should execute wrapped function again after refresh period', async () => {
    const cacheRefreshPeriodMs = 100;
    const asyncFunction = jest.fn().mockResolvedValue(3);
    const throttled = throttleAsyncFunction({ asyncFunction, cacheRefreshPeriodMs });

    await throttled.call();
    await throttled.call()
    await delay(cacheRefreshPeriodMs + 10);
    await throttled.call();

    expect(asyncFunction).toHaveBeenCalledTimes(2);
  });

  it('it should not call wrapped function twice for new call while previous call is still in progress', async () => {
    let resolvePromise;
    const asyncFunction = jest.fn()
      .mockImplementation(() => new Promise(resolve => (resolvePromise = resolve)));
    const throttled = throttleAsyncFunction({ asyncFunction });

    const promise1 = throttled.call();
    const promise2 = throttled.call();

    expect(asyncFunction).toHaveBeenCalledTimes(1);

    resolvePromise(12);
    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect([result1, result2]).toEqual([12, 12]);
  });

  it('it should return previous result from cache if a new refresh is still in progress', async () => {
    const cacheRefreshPeriodMs = 100;
    let resolveSecondCall;
    const asyncFunction = jest.fn()
      .mockImplementationOnce(async () => 'firstResult')
      .mockImplementationOnce(async () => new Promise(resolve => (resolveSecondCall = resolve)));
    const throttled = throttleAsyncFunction({ asyncFunction, cacheRefreshPeriodMs });

    const firstResultFillCache = await throttled.call();
    expect(firstResultFillCache).toEqual('firstResult');

    await delay(cacheRefreshPeriodMs + 10);

    const secondCallResult = await throttled.call();
    expect(secondCallResult).toEqual('firstResult');

    resolveSecondCall('secondResult');
    await delay(0);

    const thirdCallResult = await throttled.call();
    expect(thirdCallResult).toEqual('secondResult');
  });

  it('it should throw if wrapped unction fails for the first time for given args', async () => {
    const asyncFunction = () => { throw new Error('error from asyncFunction'); };
    const throttled = throttleAsyncFunction({ asyncFunction });

    await expect(throttled.call()).rejects.toThrowError('error from asyncFunction');
  });

  it('should return latest non expired result when wrapped function failed', async () => {
    const cacheRefreshPeriodMs = 100;
    const asyncFunction = jest.fn()
      .mockResolvedValueOnce(14)
      .mockRejectedValueOnce(new Error('things are bad, but we have cache'));
    const throttled = throttleAsyncFunction({ asyncFunction, cacheRefreshPeriodMs });

    await throttled.call();
    await delay(cacheRefreshPeriodMs + 10);
    const secondResult = await throttled.call();

    expect(secondResult).toEqual(14);
  });

  it('should throw if latest successful wrapped function call was before expiration time', async () => {
    const cacheRefreshPeriodMs = 50;
    const cacheExpiryMs = 100;
    const asyncFunction = jest.fn()
      .mockResolvedValueOnce(14)
      .mockRejectedValueOnce(new Error('pesky persistent error'));
    const throttled = throttleAsyncFunction({ asyncFunction, cacheRefreshPeriodMs, cacheExpiryMs });

    await throttled.call();
    await delay(cacheExpiryMs + 10);

    await expect(throttled.call()).rejects.toThrowError('pesky persistent error');
  });
});
