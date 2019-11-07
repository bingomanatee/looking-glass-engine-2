const tap = require('tap');
const _ = require('lodash');

const {ValueStream} = require('./../lib/index');

tap.test('ValueStream', (suite) => {
  suite.test('constructor', (testConstructor) => {
    testConstructor.test('name only', (testN) => {

      const s = new ValueStream('Bob');

      testN.same(s.name, 'Bob');
      testN.ok(s.isNew);
      testN.notOk(s.isActive);
      testN.notOk(s.hasChildren);
      testN.end();
    });

    testConstructor.test('name and value', (testNV) => {

      const valStream = new ValueStream('Bob', 1000);

      testNV.same(valStream.name, 'Bob');
      testNV.notOk(valStream.isNew);
      testNV.ok(valStream.isActive);
      testNV.notOk(valStream.hasChildren);
      testNV.same(valStream.value, 1000);
      testNV.end();
    });

    testConstructor.test('name, value, type', (testNVT) => {

      const valStream = new ValueStream('Bob', 1000, 'number');

      testNVT.same(valStream.name, 'Bob');
      testNVT.notOk(valStream.isNew);
      testNVT.ok(valStream.isActive);
      testNVT.notOk(valStream.hasChildren);
      testNVT.same(valStream.value, 1000);
      testNVT.same(valStream.type, 'number');
      testNVT.end();
    });

    testConstructor.end();
  });

  suite.test('single value stream', (testSVStream) => {
    const valStream = new ValueStream('Bob', 1000);
    // monitor activity
    const values = [];
    const errors = [];
    const s = valStream.subscribe((v) => values.push(v), (e) => errors.push(e));

    testSVStream.same(valStream.name, 'Bob');
    testSVStream.notOk(valStream.isNew);
    testSVStream.ok(valStream.isActive);
    testSVStream.notOk(valStream.hasChildren);
    testSVStream.same(valStream.value, 1000);

    testSVStream.same(values, [1000], 'values contains initial startValue');

    valStream.set(2000);
    testSVStream.same(values, [1000, 2000], 'values contains initial startValue');
    testSVStream.same(valStream.value, 2000);
    s.unsubscribe();

    testSVStream.same(errors, [], 'no errors caught');

    testSVStream.end();
  });

  suite.test('single value stream with type', (testSVStream) => {
    const valStream = new ValueStream('Bob', 1000, 'number');

    /// monitor activity
    const values = [];
    const errors = [];
    const s = valStream.subscribe((v) => values.push(v), (e) => errors.push(e));

    testSVStream.same(valStream.name, 'Bob');
    testSVStream.notOk(valStream.isNew);
    testSVStream.ok(valStream.isActive);
    testSVStream.notOk(valStream.hasChildren);
    testSVStream.same(valStream.value, 1000);

    testSVStream.same(values, [1000], 'values contains initial startValue');

    valStream.set('Flanders'); // stupid Flanders
    testSVStream.same(values, [1000], 'values contains initial startValue');
    testSVStream.same(valStream.value, 1000);

    testSVStream.same(errors.length, 1, '1 error caught');
    testSVStream.same(errors[0].message, "bad set attempt");

    s.unsubscribe();
    testSVStream.end();
  });

  suite.test('parent stream', (testPS) => {
    const valStream = new ValueStream('Bob')
      .addSubStream('name', 'Robert Paulson', 'string')
      .addSubStream('age', 50, 'number')
      .addSubStream('alive', false);

    // monitor activity
    const values = [];
    const errors = [];
    const s = valStream.subscribe((v) => values.push(v), (e) => errors.push(e));

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

  suite.test('.hasChildren', (testSet) => {
    const valStream = new ValueStream('Bob');

    testSet.notOk(valStream.hasChildren, 'does not have children');
    valStream.addSubStream('age', 20);
    testSet.ok(valStream.hasChildren, 'has children');
    testSet.ok(valStream.has('age'), 'has new prop');

    testSet.end();
  });

  suite.end();
});
