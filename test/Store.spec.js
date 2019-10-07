const tap = require('tap');
const _ = require('lodash');
const is = require('is_js');

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

  suite.test('streaming', (cTest) => {
    const s = new Store({
      state: {a: 1, b: 2},
      name: 'streaming store',
      actions: {
        doubleA: ({state}) => {
          const a = 2 * state.a;
          return {...state, a};
        }
      }
    });
    const msg = [];
    const sub = s.subscribe(({state}) => {
      msg.push(state)
    });

    cTest.same(msg, [{a: 1, b: 2}]);
    s.actions.doubleA();
    cTest.same(msg, [{a: 1, b: 2}, {a: 2, b: 2}]);

    s.complete();
    sub.unsubscribe();
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
      .addStateProp('b', {c: 2, d: 3}, 'object')
      .addStateProp('a', 1, 'integer');

    cTest.equal(_.get(s, 'state.a'), 1);
    cTest.same(_.get(s, 'state.b'), {c: 2, d: 3});

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

  suite.test('transactional locking', async (cTest) => {
    const s = new Store({
      actions: {
        'switchTrans': {
          action: async (store) => {
            const {a, b} = store.state;
            await store.actions.setA(b);
            await store.actions.setB(a);
          },
          info: {transaction: true}
        },
        'switch': async (store) => {
          const {a, b} = store.state;
          await store.actions.setA(b);
          await store.actions.setB(a);
        },
      },
      props: {
        a: {
          start: 1,
          type: 'integer'
        },
        b: {
          start: 2,
          type: 'integer'
        }
      }
    });

    const events = [];

    s.subscribe(({state}) => events.push(state));

    await s.actions.switchTrans();
    cTest.ok(_.isEqual(events, [{a: 1, b: 2}, {a: 2, b: 1}]), 'transaction hides middle updates');

    await s.actions.switch();
    cTest.ok(_.isEqual(events, [{a: 1, b: 2}, {a: 2, b: 1}, {a: 1, b: 1}, {a: 1, b: 2}]), 'more steps without transaction');

    s.complete();

    cTest.end();
  });

  suite.end();
});
