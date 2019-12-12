const tap = require('tap');
const _ = require('lodash');
const is = require('is');

const {ValueStream} = require('./../lib/index');

tap.test('ValueStream', (suite) => {
  suite.test('constructor', (testConstructor) => {
    testConstructor.test('name only', (testN) => {

      const nameOnlyStream = new ValueStream('name only stream');

      testN.same(nameOnlyStream.name, 'name only stream');
      testN.ok(nameOnlyStream.isNew);
      testN.notOk(nameOnlyStream.isActive);
      testN.notOk(nameOnlyStream.hasChildren);
      testN.notOk(nameOnlyStream.hasValue);
      testN.end();
    });

    testConstructor.test('name and value', (testNV) => {

      const nvStream = new ValueStream({
        name: 'name value stream',
        value: 1000
      });

      testNV.same(nvStream.name, 'name value stream');
      testNV.notOk(nvStream.isNew);
      testNV.ok(nvStream.isActive);
      testNV.notOk(nvStream.hasChildren);
      testNV.ok(nvStream.hasValue);
      testNV.same(nvStream.value, 1000);
      testNV.end();
    });

    testConstructor.test('name, value, type', (testNVT) => {

      const nvtStream = new ValueStream({
        name: 'nvt', value: 1000, type: 'number'
      });

      testNVT.same(nvtStream.name, 'nvt');
      testNVT.notOk(nvtStream.isNew);
      testNVT.ok(nvtStream.isActive);
      testNVT.notOk(nvtStream.hasChildren);
      testNVT.ok(nvtStream.hasValue);
      testNVT.same(nvtStream.value, 1000);
      testNVT.same(nvtStream.type, 'number');
      testNVT.end();
    });

    testConstructor.test('redefinition', (redef) => {
      const feedback = [];

      const actions = {
        whatYouGoingToDo(v) {
          feedback.push(['my value: ', v.state, 'my type', v.type]);
        }
      };

      const badBoy = new ValueStream('Bad Boy', 'bad boy', actions, 'string');
      badBoy.do.whatYouGoingToDo();
// 'my value: ', 'bad boy', 'my type', 'string'
      badBoy.addChild('age', 10)
        .addChild('weight', 300);
      badBoy.do.whatYouGoingToDo();

      redef.same(feedback,
        [
          [
            "my value: ",
            "bad boy",
            "my type",
            "string",
          ],
          [
            "my value: ",
            {
              "age": 10,
              "weight": 300,
            },
            "my type",
            undefined,
          ],
        ]
      );
      redef.end();
    });

    testConstructor.test('value vs object', (vvo) => {

      const listStream = new ValueStream('list stream', {a: 1, b: 2});
      vvo.ok(is.undef(listStream.do.setA));

      const paramValue = new ValueStream({name: 'param value stream', value: {a: 1, b: 2}});
      vvo.ok(is.undef(paramValue.do.setA));

      const paramChildren = new ValueStream({name: 'param children stream', children: {a: 1, b: 2}});
      vvo.ok(is.fn(paramChildren.do.setA));

      vvo.end();
    });

    testConstructor.end();
  });

  suite.test('single value stream', (testSVStream) => {
    const valStream = new ValueStream({
      name: 'single value stream',
      value: 1000
    });
    // monitor activity
    const values = [];
    const errors = [];

    const s = valStream.subscribeToValue((state) => {
      return values.push(state);
    }, (e) => errors.push(e));

    testSVStream.same(valStream.name, 'single value stream');
    testSVStream.notOk(valStream.isNew);
    testSVStream.ok(valStream.isActive);
    testSVStream.notOk(valStream.hasChildren);
    testSVStream.same(valStream.value, 1000);
    testSVStream.same(values, [1000], 'values contains initial startValue');

    valStream.value = 2000;
    testSVStream.same(values, [1000, 2000], 'values contains initial startValue');
    testSVStream.same(valStream.value, 2000);
    s.unsubscribe();

    testSVStream.same(errors, [], 'no errors caught');

    testSVStream.end();
  });

  suite.test('single value stream with type', (testSVStream) => {
    const svTypedStream = new ValueStream({
      name: 'single value stream with type',
      value: 1000,
      type: 'number'
    });

    /// monitor activity
    const values = [];
    const errors = [];
    const s = svTypedStream.subscribeToValue((state) => values.push(state), (e) => errors.push(e));

    testSVStream.same(svTypedStream.name, 'single value stream with type');
    testSVStream.notOk(svTypedStream.isNew);
    testSVStream.ok(svTypedStream.isActive);
    testSVStream.notOk(svTypedStream.hasChildren);
    testSVStream.same(svTypedStream.value, 1000);

    testSVStream.same(values, [1000], 'values contains initial startValue');

    svTypedStream.value = 'Flanders';
    testSVStream.same(values, [1000], 'values contains initial startValue');
    testSVStream.same(svTypedStream.value, 1000);

    testSVStream.same(errors.length, 1, '1 error caught');
    testSVStream.same(errors[0].message, "attempt to set invalid value");

    s.unsubscribe();

    testSVStream.end();
  });

  suite.test('name children stream', (testNC) => {
    const ncStream = new ValueStream({
      name: 'name children', children: {
        age: 50,
        name: 'Bob',
        height: 70, // inches,
        weight: 200
      }
    });

    // monitor activity
    const values = [];
    const errors = [];
    const s = ncStream.subscribeToValue((state) => values.push(state), (e) => errors.push(e));

    testNC.same(errors, []);
    testNC.same(values, [{age: 50, name: 'Bob', height: 70, weight: 200}]);

    ncStream.set('age', 45);
    testNC.same(errors, []);
    testNC.same(values, [
      {age: 50, name: 'Bob', height: 70, weight: 200},
      {age: 45, name: 'Bob', height: 70, weight: 200}
    ]);
    s.unsubscribe();
    testNC.end();
  });

  suite.test('name typed stream', (testNC) => {
    const typedStream = new ValueStream({
      name: 'name children', children: {
        age: {value: 50, type: 'number'},
        name: {value: 'Bob', type: 'string'},
        height: 70, // inches,
        weight: 200
      }
    });

    // monitor activity
    const values = [];
    const errors = [];
    const s = typedStream.subscribeToValue((state) => values.push(state), (e) => errors.push(e));

    testNC.same(errors, []);
    testNC.same(values, [{age: 50, name: 'Bob', height: 70, weight: 200}]);

    typedStream.do.setAge(45);
    testNC.same(errors, []);

    testNC.same(values, [
      {age: 50, name: 'Bob', height: 70, weight: 200},
      {age: 45, name: 'Bob', height: 70, weight: 200}
    ]);

    typedStream.do.setAge('stupid Flanders');
    testNC.same(errors.map(e => _.pick(e, ['message', 'child', 'error.value'])),
      [
        {
          "message": "child error:attempt to set invalid value",
          "child": "age",
          "error": {
            "value": "stupid Flanders",
          },
        },
      ]
    );
    testNC.same(values, [
      {age: 50, name: 'Bob', height: 70, weight: 200},
      {age: 45, name: 'Bob', height: 70, weight: 200}
    ]);


    typedStream.do.setName(200);

    testNC.same(errors.map(e => _.pick(e, ['message', 'child', 'error.value'])),
      [
        {
          "message": "child error:attempt to set invalid value",
          "child": "age",
          "error": {
            "value": "stupid Flanders",
          },
        },

        {
          "message": "child error:attempt to set invalid value",
          "child": "name",
          "error": {
            "value": 200,
          },
        },
      ]
    );
    // where is the second error?

    testNC.same(values, [
      {age: 50, name: 'Bob', height: 70, weight: 200},
      {age: 45, name: 'Bob', height: 70, weight: 200}
    ]);
    typedStream.do.setName('Robert');
    testNC.same(values, [
      {age: 50, name: 'Bob', height: 70, weight: 200},
      {age: 45, name: 'Bob', height: 70, weight: 200},
      {age: 45, name: 'Robert', height: 70, weight: 200}
    ]);


    s.unsubscribe();
    testNC.end();
  });

  suite.test('parent stream', (testPS) => {
    const valStream = new ValueStream('Bob')
      .addSubStream('name', 'Robert Paulson', 'string')
      .addSubStream('age', 50, 'number')
      .addSubStream('alive', false);

    // monitor activity
    const values = [];
    const errors = [];
    const s = valStream.subscribeToValue((state) => values.push(state), (e) => errors.push(e));

    testPS.same(values, [{name: 'Robert Paulson', age: 50, alive: false}], 'stream has all the props');
    testPS.same(valStream.values, {name: 'Robert Paulson', age: 50, alive: false}, 'starts with initial values');

    valStream.set('age', 20);
    testPS.same(values, [
        {name: 'Robert Paulson', age: 50, alive: false},
        {name: 'Robert Paulson', age: 20, alive: false}
      ]
    );
    testPS.same(valStream.values.age, 20);
    s.unsubscribe();
    testPS.end();
  });

  suite.test('actions', (actionsTest) => {
    actionsTest.test('set action', (saTest) => {
      const valStream = new ValueStream('Bob')
        .addSubStream('name', 'Robert Paulson', 'string')
        .addSubStream('age', 50, 'number')
        .addSubStream('alive', false);

      // monitor activity
      const values = [];
      const errors = [];
      const s = valStream.subscribeToValue((state) => values.push(state), (e) => errors.push(e));

      saTest.same(values, [{name: 'Robert Paulson', age: 50, alive: false}], 'stream has all the props');
      saTest.same(valStream.values, {name: 'Robert Paulson', age: 50, alive: false}, 'starts with initial values');

      valStream.actions.setAge(20);
      saTest.same(values, [
          {name: 'Robert Paulson', age: 50, alive: false},
          {name: 'Robert Paulson', age: 20, alive: false}
        ]
      );
      saTest.same(valStream.values.age, 20);
      s.unsubscribe();

      saTest.end();
    });

    actionsTest.test('custom action', (customActionTest) => {
      const valStream = new ValueStream('Bob')
        .addSubStream('name', 'Robert Paulson', 'string')
        .addSubStream('age', 50, 'number')
        .addSubStream('alive', true)
        .addAction('addAge', ({actions, state}, years = 1) => {
          const {age} = state;
          const newAge = age + years;
          actions.setAge(newAge);
          if (newAge > 70) {
            actions.setAlive(false);
          }
        });

      // monitor activity
      const values = [];
      const errors = [];
      const s = valStream.subscribeToValue((state) => values.push(state), (e) => errors.push(e));

      customActionTest.same(values, [{name: 'Robert Paulson', age: 50, alive: true}],
        'stream has all the props');
      customActionTest.same(valStream.values, {
        name: 'Robert Paulson',
        age: 50,
        alive: true
      }, 'starts with initial values');

      valStream.actions.addAge(10);
      customActionTest.same(values, [
          {name: 'Robert Paulson', age: 50, alive: true},
          {name: 'Robert Paulson', age: 60, alive: true}
        ]
      );
      valStream.actions.addAge(10);
      valStream.actions.addAge(10);
      customActionTest.same(values, [
          {name: 'Robert Paulson', age: 50, alive: true},
          {name: 'Robert Paulson', age: 60, alive: true},
          {name: 'Robert Paulson', age: 70, alive: true},
          {name: 'Robert Paulson', age: 80, alive: true},
          {name: 'Robert Paulson', age: 80, alive: false}
        ]
      );

      customActionTest.same(valStream.values.age, 80);
      s.unsubscribe();

      customActionTest.end();
    });

    actionsTest.test('custom action - transactional', async (customActionTest) => {
      const valStream = new ValueStream('Bob')
        .addSubStream('name', 'Robert Paulson', 'string')
        .addSubStream('age', 50, 'number')
        .addSubStream('alive', true)
        .addAction('addAge', ({actions, state}, years = 1) => {
          const {age} = state;
          const newAge = age + years;
          actions.setAge(newAge);
          if (newAge > 70) {
            actions.setAlive(false);
          }
        }, true);

      // monitor activity
      const values = [];
      const errors = [];
      const s = valStream.subscribeToValue((state) => {
        values.push(state);
      }, (e) => {
        return errors.push(e);
      });

      customActionTest.same(values, [{name: 'Robert Paulson', age: 50, alive: true}],
        'stream has all the props');
      customActionTest.same(valStream.values, {
        name: 'Robert Paulson',
        age: 50,
        alive: true
      }, 'starts with initial values');
      await valStream.actions.addAge(10);
      customActionTest.same(values, [
          {name: 'Robert Paulson', age: 50, alive: true},
          {name: 'Robert Paulson', age: 60, alive: true}
        ]
      );

      await valStream.actions.addAge(10);
      await valStream.actions.addAge(10);
      customActionTest.same(values, [
          {name: 'Robert Paulson', age: 50, alive: true},
          {name: 'Robert Paulson', age: 60, alive: true},
          {name: 'Robert Paulson', age: 70, alive: true},
          {name: 'Robert Paulson', age: 80, alive: false}
        ]
      );

      customActionTest.same(valStream.values.age, 80);
      s.unsubscribe();

      customActionTest.end();
    });

    actionsTest.test('with set', async (caSetTest) => {
      const coord = new ValueStream('coord')
        .addChild('x', 0, 'number')
        .addChild('y', 0, 'number')
        .addAction('transform', (v, xT, yT) => {
          if (!is.number(xT)) {
            throw new Error(`bad transform x value ${xT}`)
          }

          if (!is.number(yT)) {
            throw new Error(`bad transform x value ${yT}`)
          }

          const x = v.get('x');
          const y = v.get('y');
          v.set('x', x + xT, 'y', y + yT);
        })
        .addAction('scale', (v, n) => {
          if (!is.number(n)) {
            throw new Error('bad scale value')
          }
          const x = v.get('x');
          const y = v.get('y');
          v.set('x', x * n, 'y', y * n);
        });

      // monitor activity
      const values = [];
      const errors = [];
      const s = coord.subscribeToValue((xy) => {
        values.push(xy);
      }, (e) => {
        return errors.push(e);
      });

      caSetTest.same(values, [{x: 0, y: 0}]);
      coord.do.transform(2, 3);
      caSetTest.same(values, [
        {x: 0, y: 0},
        {x: 2, y: 3}
      ]);

      coord.do.transform(-1, 0);
      caSetTest.same(values, [
        {x: 0, y: 0},
        {x: 2, y: 3},
        {x: 1, y: 3}
      ]);

      coord.do.scale(2);
      caSetTest.same(values, [
        {x: 0, y: 0},
        {x: 2, y: 3},
        {x: 1, y: 3},
        {x: 2, y: 6}
      ]);

      s.unsubscribe();

      caSetTest.end();
    });

    actionsTest.test('with errors', async (caSetTest) => {
      const coord = new ValueStream('coord')
        .addChild('x', 0, 'number')
        .addChild('y', 0, 'number')
        .addAction('transform', (v, xT, yT) => {
          if (!is.number(xT)) {
            throw new Error(`bad transform x value ${xT}`)
          }

          if (!is.number(yT)) {
            throw new Error(`bad transform x value ${yT}`)
          }

          const x = v.get('x');
          const y = v.get('y');
          v.set('x', x + xT, 'y', y + yT);
        })
        .addAction('scale', (v, n) => {
          if (!is.number(n)) {
            throw new Error('bad scale value')
          }
          const x = v.get('x');
          const y = v.get('y');
          v.set('x', x * n, 'y', y * n);
        });

      // monitor activity
      const values = [];
      const errors = [];
      const s = coord.subscribeToValue((xy) => {
        values.push(xy);
      }, (e) => {
        return errors.push(e);
      });

      coord.set('x', 10, 'y', 5);

      caSetTest.same(values, [{x: 0, y: 0}, {x: 10, y: 5}]);
      coord.do.scale(2);
      caSetTest.same(values, [
        {x: 0, y: 0},
        {x: 10, y: 5},
        {x: 20, y: 10},
      ]);

      caSetTest.same(errors, []);

      coord.do.scale(null);
      caSetTest.same(values, [
        {x: 0, y: 0},
        {x: 10, y: 5},
        {x: 20, y: 10},
      ]);
      caSetTest.same(errors, [new Error('bad scale value')]);

      s.unsubscribe();

      caSetTest.end();
    });

    actionsTest.test('async actions', (asyncTest) => {
      asyncTest.test('sync calls', async (syncTest) => {

        const syncStream = new ValueStream('sync stream')
          .addChild('a', 1)
          .addChild('b', 2)
          .addAction('addAtoB', (store) => {
            const a = store.get('a');
            const b = store.get('b');
            store.do.setB(a + b);
          })
          .addAction('asyncAddAtoB', async (store) => {
            const a = store.get('a');
            const b = store.get('b');
            store.do.setB(a + b);
          })
          .addAction('asyncDelayedAddAtoB', async (store) => {
            const a = store.get('a');
            const b = store.get('b');
            await new Promise((done) => setTimeout(done, 300));
            store.do.setB(a + b);
          });

        syncTest.same(syncStream.children.get('a'), 1, 'a is 1');
        syncTest.same(syncStream.get('b'), 2, 'b is 2');
        syncStream.do.addAtoB();
        syncTest.same(syncStream.get('b'), 3, 'b is changed to 3');

        syncStream.do.asyncAddAtoB();
        // even async functions resolve immediately if they don't actually have promises
        syncTest.same(syncStream.get('b'), 4, 'b is changed to 4');

        syncStream.do.asyncDelayedAddAtoB();
        syncTest.same(syncStream.get('b'), 4, 'b has not yet changed to 5');
        await new Promise((done) => setTimeout(done, 500));
        syncTest.same(syncStream.get('b'), 5, 'b has changed to 5');

        syncTest.end();
      });
      asyncTest.test('leaky async calls', async (syncTest) => {

        const syncStream = new ValueStream('sync stream')
          .addChild('a', 1)
          .addChild('b', 3)
          .addAction('addAtoB', (store) => {
            const a = store.get('a');
            const b = store.get('b');
            store.do.setB(a + b);
          })
          .addAction('asyncAddAtoB', async (store) => {
            const a = store.get('a');
            const b = store.get('b');
            // because the promise is returned, it WILL be resolved before the
            // return value of the action is resolved.
            return new Promise((done) => setTimeout(done, 300))
              .then(() => {
                store.do.setB(a + b);
              });
          })
          .addAction('asyncDelayedAddAtoBleaky', async (store) => {
            const a = store.get('a');
            const b = store.get('b');
            // note we neither wait for the promise to resolve NOR return the promise
            new Promise((done) => setTimeout(done, 300))
              .then(() => {
                store.do.setB(a + b);
              });
          });

        syncTest.same(syncStream.children.get('a'), 1, 'a is 1');
        syncTest.same(syncStream.get('b'), 3, 'b is 3');
        syncStream.do.addAtoB();
        syncTest.same(syncStream.get('b'), 4, 'b is changed to 4');

        syncStream.do.asyncDelayedAddAtoBleaky();
        syncTest.same(syncStream.get('b'), 4, 'b has not yet changed to 5');
        // the promise inside the 'leaky' action is not awaited;
        // therefore it will resolve when it wants to, not before the end of the action

        await new Promise((done) => setTimeout(done, 500));
        syncTest.same(syncStream.get('b'), 5, 'b has changed to 5');

        await syncStream.do.asyncDelayedAddAtoBleaky();
        syncTest.same(syncStream.get('b'), 5, 'b has not yet changed to 6');
        await new Promise((done) => setTimeout(done, 500));
        // even await-ing an action won't work if the action itself has
        // not been designed to wait for its sub-threads to resolve.
        syncTest.same(syncStream.get('b'), 6, 'b has changed to 6');

        await syncStream.do.asyncAddAtoB()
        // since we are waiting for a non-leaky async, we should get the results
        // after the await resolution.
        syncTest.same(syncStream.get('b'), 7, 'b has changed to 7');

        syncTest.end();
      });

      asyncTest.end();
    });
    actionsTest.end();
  });

  suite.test('.hasChildren', (testSet) => {
    const valStream = new ValueStream('Bob');

    testSet.notOk(valStream.hasChildren, 'does not have children');
    valStream.addSubStream('age', 20);
    testSet.ok(valStream.hasChildren, 'has children');
    testSet.ok(valStream.has('age'), 'has new prop');

    testSet.end();
  });

  suite.test('filter', (testFilter) => {
    const ncStream = new ValueStream({
      name: 'name children', children: {
        age: 50,
        name: 'Bob',
        height: 70, // inches,
        weight: 200
      }
    });

    // monitor activity
    const values = [];
    const subValues = [];
    const errors = [];
    const s = ncStream.subscribe(({state}) => values.push(state), (e) => errors.push(e));
    const subS = ncStream.filter('name', 'age')
      .subscribe((v) => {
        subValues.push(v);
      });

    testFilter.same(errors, []);
    testFilter.same(values, [{age: 50, name: 'Bob', height: 70, weight: 200}]);
    testFilter.same(subValues, [{name: 'Bob', age: 50}]);

    ncStream.do.setHeight(69);

    testFilter.same(errors, []);
    testFilter.same(values, [
      {age: 50, name: 'Bob', height: 70, weight: 200},
      {age: 50, name: 'Bob', height: 69, weight: 200},
    ]);
    // the sub-values shouldn't change because an irrelevant field is changed.
    testFilter.same(subValues, [{name: 'Bob', age: 50}]);

    ncStream.do.setAge(51);
    testFilter.same(values, [
      {age: 50, name: 'Bob', height: 70, weight: 200},
      {age: 50, name: 'Bob', height: 69, weight: 200},
      {age: 51, name: 'Bob', height: 69, weight: 200},
    ]);
    // the sub-values DO change because a watched field is changed.
    testFilter.same(subValues, [
      {name: 'Bob', age: 50},
      {name: 'Bob', age: 51},
    ]);
    s.unsubscribe();
    subS.unsubscribe();
    testFilter.end();
  });

  suite.test('events', (testE) => {
    testE.test('with action', (withA) => {
      const eStream = new ValueStream('point')
        .addChild('x', 0, 'number')
        .addChild('y', 0, 'number')
        .addChild('dist', 0, 'number')
        .addAction('updateDist', (stream) => {
          const x = stream.get('x');
          const y = stream.get('y');
          const dist = Math.round(Math.sqrt((x ** 2) + (y ** 2)));
          stream.do.setDist(dist);
        })
        .watch('x', 'updateDist')
        .watch('y', 'updateDist');

      // monitor activity
      const values = [];
      const errors = [];
      const s = eStream.subscribe(({state}) => values.push(state), (e) => errors.push(e));

      eStream.do.setX(10);
      eStream.do.setY(20);

      withA.same(values, [
        {x: 0, y: 0, dist: 0},
        {x: 10, y: 0, dist: 10},
        {x: 10, y: 20, dist: 22}]
      );

      s.unsubscribe();
      withA.end();
    });
    testE.test('with action parameterized', (withA) => {
      const eStream = new ValueStream('point')
        .addChild('x', 0, 'number')
        .addChild('y', 0, 'number')
        .addChild('dist', 0, 'number')
        .addChild('lastYchange', 0, 'number')
        .addAction('updateYchange', (stream, change) => {
          const {value, was} = change;
          stream.set('lastYchange', value - was);
        } )
        .addAction('updateDist', (stream) => {
          const x = stream.get('x');
          const y = stream.get('y');

          const dist = Math.round(Math.sqrt((x ** 2) + (y ** 2)));
          stream.do.setDist(dist);
        })
        .watch('x', 'updateDist')
        .watch('y', 'updateYchange')
        .watch('y', 'updateDist');

      // monitor activity
      const values = [];
      const errors = [];
      const s = eStream.subscribe(({state}) => values.push(state), (e) => errors.push(e));

      eStream.do.setX(10);
      eStream.do.setY(20);

      withA.same(eStream.get('lastYchange'), 20);
      withA.same(eStream.get('dist'), 22);

      eStream.do.setY(30);

      withA.same(eStream.get('lastYchange'), 10);
      withA.same(eStream.get('dist'), 32);

      s.unsubscribe();
      withA.end();
    });

    testE.test('with function', (withA) => {

      const updateDist = () => {
        const x = eStream.get('x');
        const y = eStream.get('y');
        const dist = Math.round(Math.sqrt((x ** 2) + (y ** 2)));
        eStream.do.setDist(dist);
      };
      const eStream = new ValueStream('point')
        .addChild('x', 0, 'number')
        .addChild('y', 0, 'number')
        .addChild('dist', 0, 'number')
        .watch('x', updateDist)
        .watch('y', updateDist);

      // monitor activity
      const values = [];
      const errors = [];
      const s = eStream.subscribe(({state}) => values.push(state), (e) => errors.push(e));

      eStream.do.setX(10);
      eStream.do.setY(20);

      withA.same(values, [
        {x: 0, y: 0, dist: 0},
        {x: 10, y: 0, dist: 10},
        {x: 10, y: 20, dist: 22}]
      );

      s.unsubscribe();
      withA.end();
    });

    testE.end();
  });

  suite.test('my', (testMy) => {

    const s = new ValueStream('withMy')
      .addChild('alpha', 0, 'number')
      .addChild('beta', 0, 'number')
      .addChild('sum', 0, 'number')
      .addAction('updateSum', (stream) => {
        stream.my.sum = stream.my.beta + stream.my.alpha;
      })
      .watch('alpha', 'updateSum')
      .watch('beta', 'updateSum');

    testMy.same(s.my.alpha, 0);
    testMy.same(s.my.beta, 0);
    testMy.same(s.my.sum, 0);

    s.my.beta = 2;

    testMy.same(s.my.alpha, 0);
    testMy.same(s.my.beta, 2);
    testMy.same(s.my.sum, 2);

    const {my} = s;

    testMy.end();
  });

  suite.end();
});
