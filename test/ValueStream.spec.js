const tap = require('tap');
const _ = require('lodash');

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

    const s = valStream.subscribe((store) => {
      return values.push(store.state);
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
    const svTypedSteam = new ValueStream({
      name: 'single value stream with type',
      value: 1000,
      type: 'number'
    });

    /// monitor activity
    const values = [];
    const errors = [];
    const s = svTypedSteam.subscribe(({state}) => values.push(state), (e) => errors.push(e));

    testSVStream.same(svTypedSteam.name, 'single value stream with type');
    testSVStream.notOk(svTypedSteam.isNew);
    testSVStream.ok(svTypedSteam.isActive);
    testSVStream.notOk(svTypedSteam.hasChildren);
    testSVStream.same(svTypedSteam.value, 1000);

    testSVStream.same(values, [1000], 'values contains initial startValue');

    svTypedSteam.value = 'Flanders';
    testSVStream.same(values, [1000], 'values contains initial startValue');
    testSVStream.same(svTypedSteam.value, 1000);

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
    const s = ncStream.subscribe(({state}) => values.push(state), (e) => errors.push(e));

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

  suite.test('parent stream', (testPS) => {
    const valStream = new ValueStream('Bob')
      .addSubStream('name', 'Robert Paulson', 'string')
      .addSubStream('age', 50, 'number')
      .addSubStream('alive', false);

    // monitor activity
    const values = [];
    const errors = [];
    const s = valStream.subscribe(({state}) => values.push(state), (e) => errors.push(e));

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
      const s = valStream.subscribe(({state}) => values.push(state), (e) => errors.push(e));

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
      const s = valStream.subscribe(({state}) => values.push(state), (e) => errors.push(e));

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
      const s = valStream.subscribe((store) => {
        return values.push(store.state);
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

  suite.end();
});
