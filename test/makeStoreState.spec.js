const tap = require('tap');
const _ = require('lodash');

const {makeStoreState, STORE_STATE_RUNNING, STORE_STATE_COMPLETE, STORE_STATE_ERROR} = require('./../lib/index');

tap.test('makeStoreState', (suite) => {
  suite.test('constructor', (cTest) => {
    const ss = makeStoreState();
    cTest.equal(ss.state, STORE_STATE_RUNNING, 'store state starts running');
    cTest.end();
  });

  suite.end();
});
