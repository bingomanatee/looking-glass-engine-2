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
        doubleA: (store) => {
          console.log('store:', store);
          const {state} = store;
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

    cTest.equal(_.get(s, 'state.a'), 1);
    const p = s.actions.doubleA();
    cTest.equal(_.get(s, 'state.a'), 1);
    await p;
    cTest.equal(_.get(s, 'state.a'), 2);
    s.complete();

    cTest.end();
  });

  suite.test('property - untyped', (cTest) => {
    const s = new Store({})
      .addStateProp('a', {
        start: 1
      });

    cTest.equal(_.get(s, 'state.a'), 1);
    s.actions.setA(3);
    cTest.equal(_.get(s, 'state.a'), 3);

    s.complete();

    cTest.end();
  });

  suite.test('property - typed', (cTest) => {
    const s = new Store({})
      .addStateProp('a', {
        start: 1,
        type: 'integer'
      });

    cTest.equal(_.get(s, 'state.a'), 1);
    s.actions.setA(3);
    cTest.equal(_.get(s, 'state.a'), 3);
    s.actions.setA('five');
    cTest.equal(_.get(s, 'state.a'), 3);

    s.complete();

    cTest.end();
  });

  suite.test('property - inline', (cTest) => {
    const s = new Store({})
      .addStateProp('a', 1, 'integer');

    cTest.equal(_.get(s, 'state.a'), 1);
    s.actions.setA(3);
    cTest.equal(_.get(s, 'state.a'), 3);
    s.actions.setA('five');
    cTest.equal(_.get(s, 'state.a'), 3);

    s.complete();

    cTest.end();
  });

  suite.test('property - advanced validation', (cTest) => {
    const s = new Store({})
      .addStateProp('a', 1, ['integer', (value) => {
        if (!is.odd(value)) {
          throw new Error(`a (${value})must be odd`);
        }
      }]);

    s.subscribe(({state}) => {
      console.log('pav: state:', state);
    }, (err) => {
      console.log('pav: error:', err.message)
    });

    cTest.equal(_.get(s, 'state.a'), 1);
    s.actions.setA(3);
    cTest.equal(_.get(s, 'state.a'), 3);
    s.actions.setA('five');
    cTest.equal(_.get(s, 'state.a'), 3);
    s.actions.setA(6);
    cTest.equal(_.get(s, 'state.a'), 3);
    s.actions.setA(7);
    cTest.equal(_.get(s, 'state.a'), 7);

    s.complete();

    cTest.end();
  });

  suite.test('property - typed-parameterized', (cTest) => {
    const s = new Store({
      props: {
        a: {
          start: 1,
          type: 'integer'
        }
      }
    });

    cTest.equal(_.get(s, 'state.a'), 1);
    s.actions.setA(3);
    cTest.equal(_.get(s, 'state.a'), 3);
    s.actions.setA('five');
    cTest.equal(_.get(s, 'state.a'), 3);

    s.complete();

    cTest.end();
  });

  suite.test('transactional locking', (cTest) => {
    const s = new Store({
      props: {
        a: {
          start: 1,
          type: 'integer'
        }
      }
    });

    s.complete();

    cTest.end();
  });

  suite.end();
});
