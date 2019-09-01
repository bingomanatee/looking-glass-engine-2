const tap = require('tap');
const _ = require('lodash');

const {FSM, STABLE, ALL_STATES} = require('./../lib/index');

tap.test('FSM', (suite) => {

  suite.test('constructor', (cons) => {
    const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');

    cons.equal(fsm.mode, 'red', 'starts red');
    cons.ok(fsm.has('red'));
    cons.ok(fsm.has('green'));
    cons.ok(fsm.has('yellow'));
    cons.notOk(fsm.has('blue'));
    fsm.complete();

    cons.end();
  });

  suite.test('simple go', async (sg) => {
    const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');
    const states = [];
    const errors = [];
    let done = false;

    const sub = fsm.subscribe((fsmState) => {
      states.push(fsmState);
    }, (e) => errors.push(e), () => done = true);

    sg.equal(fsm.mode, 'red', 'starts red');
    sg.same(states, ['red'], 'started with red state');

    await fsm.go('yellow');
    sg.same(states, ['red', 'yellow'], 'added yellow state');
    sg.ok(!errors.length);

    fsm.complete();
    sub.unsubscribe();
    sg.end();
  });

  suite.test('async go', async (asg) => {
    const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');
    const states = [];
    const errors = [];
    let done = false;

    let endPromise;

    const sub = fsm.subscribe((fsmState) => {
      states.push(fsmState);
    }, (e) => errors.push(e), () => done = true);

    asg.equal(fsm.mode, 'red', 'starts red');
    asg.same(states, ['red'], 'started with red state');

    const p = new Promise((pDone) => endPromise = pDone);
    fsm.go('yellow', p);
    asg.same(states, ['red'], 'still red');
    asg.notOk(fsm.isStable, 'in transition state');
    asg.equal(fsm.nextState, 'yellow');
    endPromise();
    await p;

    asg.same(states, ['red', 'yellow'], 'has yellow');
    asg.ok(fsm.isStable, 'done');

    asg.ok(!errors.length);

    fsm.complete();
    sub.unsubscribe();
    asg.end();
  });

  suite.test('async go - hijack attempt', async (asg) => {
    const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');
    const states = [];
    const errors = [];
    let done = false;

    let endPromise;

    const sub = fsm.subscribe((fsmState) => {
      states.push(fsmState);
    }, (e) => errors.push(e), () => done = true);

    asg.equal(fsm.mode, 'red', 'starts red');
    asg.same(states, ['red'], 'started with red state');

    const p = new Promise((pDone) => endPromise = pDone);
    fsm.go('yellow', p);
    asg.same(fsm.state, 'red');
    asg.same(states, ['red'], 'still red');
    asg.notOk(fsm.isStable, 'in transition state');
    asg.equal(fsm.nextState, 'yellow');

    // attempt to change state WHILE a state is transitioning
    await fsm.go('green')
      .then(() => {
        asg.fail('cannot go during transition');
      })
      .catch(err => {
        asg.same(states, ['red'], 'still red');
        asg.notOk(fsm.isStable, 'in transition state');
        asg.equal(fsm.nextState, 'yellow');
      });

    endPromise();
    await p;
    asg.same(states, ['red', 'yellow'], 'has yellow');
    asg.ok(fsm.isStable, 'done');

    asg.ok(!errors.length);

    fsm.complete();
    sub.unsubscribe();
    asg.end();
  });

  suite.test('bad go', async (sg) => {
    const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');
    const states = [];
    const errors = [];
    let done = false;

    const sub = fsm.subscribe((fsmState) => {
      states.push(fsmState);
    }, (e) => errors.push(e), () => done = true);

    sg.equal(fsm.state, 'red', 'starts red');
    sg.same(states, ['red'], 'started with red state');

    try {
      await fsm.go('blue');
      sg.fail('should abort before here');
    } catch (err) {
      sg.same(states, ['red'], 'change to blue invalid');
      sg.ok(/does not have name blue/.test(err.message), 'error message for bad state')
    }

    fsm.complete();
    sub.unsubscribe();
    sg.end();
  });

  suite.test('allowing/blocking', (ab) => {

    ab.test('default/unblocked', (abd) => {
      const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');

      abd.same(fsm.report(),
        [
          ['to', 'red', 'yellow', 'green'],
          ['red', true, true, true],
          ['yellow', true, true, true],
          ['green', true, true, true]
        ]);

      abd.end();
    });
    ab.test('blocked', (abd) => {
      const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');
      fsm.block();

      abd.same(
        fsm.report(),
        [
          ['to', 'red', 'yellow', 'green'],
          ['red', false, false, false],
          ['yellow', false, false, false],
          ['green', false, false, false]
        ]);

      abd.end();
    });

    ab.test('allow all to one', (abd) => {
      const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');
      fsm.block();
      fsm.allow(ALL_STATES, 'yellow');

      abd.same(
        fsm.report(),
        [
          ['to', 'red', 'yellow', 'green'],
          ['red', false, true, false],
          ['yellow', false, true, false],
          ['green', false, true, false]
        ]);

      abd.end();
    });

    ab.test('disallow self', (abd) => {
      const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');
      fsm.block('yellow', 'yellow');
      fsm.block('red', 'red');
      fsm.block('green', 'green');

      abd.same(
        fsm.report(),
        [
          ['to', 'red', 'yellow', 'green'],
          ['red', false, true, true],
          ['yellow', true, false, true],
          ['green', true, true, false]
        ]);

      abd.end();
    });

    ab.end();
  });

  suite.test('actions', (a) => {

    a.test('basic cycle', async (al) => {
      const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'red');
      fsm.addAction('advance', 'red', 'green')
        .addAction('advance', 'green', 'yellow')
        .addAction('advance', 'yellow', 'red');

      al.equal(fsm.state, 'red');

      await fsm.do('advance');
      al.equal(fsm.state, 'green', 'first advance');

      await fsm.do('advance');
      al.equal(fsm.state, 'yellow', 'second advance');

      await fsm.do('advance');
      al.equal(fsm.state, 'red', 'third advance');

      al.end();
    });

    a.test('basic cycle -- terminal', async (al) => {
      const fsm = new FSM('stoplight', ['red', 'yellow', 'green'], 'green');
      fsm.addAction('advance', 'green', 'yellow')
        .addAction('advance', 'yellow', 'red');

      al.equal(fsm.state, 'green');

      await fsm.do('advance');
      al.equal(fsm.state, 'yellow', 'first advance');

      await fsm.do('advance');
      al.equal(fsm.state, 'red', 'second advance');

      await fsm.do('advance');
      al.equal(fsm.state, 'red', 'third advance');

      al.end();
    });


    a.end();
  });

  suite.end();
});
