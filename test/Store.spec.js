const tap = require('tap');
const _ = require('lodash');
const is = require('is');

const {Store} = require('./../lib/index');

tap.test('Store', (suite) => {

  suite.test('construction', (cTest) => {
    const s = new Store({
      state: {a: 1, b: 2},
      name: 'simpleStore',
      actions: {
        doubleA: ({state}) => {
          const a = 2 * state.a;
          return {...state, a};
        }
      }
    });

    cTest.equal(s.name, 'simpleStore');
    cTest.ok(is.function(_.get(s, 'actions.doubleA')));
    s.complete();

    cTest.end();
  });

  suite.test('custom action - synchronous', (cTest) => {
    const s = new Store({
      state: {a: 1, b: 2},
      name: 'simpleStore',
      actions: {
        doubleA: ({state}) => {
          const a = 2 * state.a;
          return {...state, a};
        }
      }
    });

    s.subscribe((store) => {
      console.log('store state set to ', store.state);
    }, e => {
      console.log('error : ', e);
    });

    cTest.equal(_.get(s, 'state.a'), 1);
    s.actions.doubleA();
    cTest.equal(_.get(s, 'state.a'), 2);

    s.complete();

    cTest.end();
  });

  suite.test('custom action - asynchronous', async (cTest) => {
    const s = new Store({
      state: {a: 1, b: 2},
      name: 'simpleStore',
      actions: {
        doubleA: ({state}) => {
          const a = 2 * state.a;
          return Promise.resolve({...state, a});
        }
      }
    });

    s.subscribe((store) => {
      console.log('store state set to ', store.state);
    }, e => {
      console.log('error : ', e);
    });

    cTest.equal(_.get(s, 'state.a'), 1);
    const p = s.actions.doubleA();
    cTest.equal(_.get(s, 'state.a'), 1);
    await p;
    cTest.equal(_.get(s, 'state.a'), 2);
    s.complete();

    cTest.end();
  });

  suite.end();
});
