const tap = require('tap');
const _ = require('lodash');

const {resolve} = require('./../lib/index');

tap.test('resolve', (suite) => {

  suite.test('simple set', async (st) => {
    const context = {state: {n: 3}};
    const double = (context) => {
      return {n: context.state.n * 2};
    };
    const newState = await resolve(context, double);

    st.same(newState, {n: 6});
    st.end();
  });

  suite.test('simple set(promise)', async (st) => {
    const context = {state: {n: 3}};
    const doublePromise = (context) => {
      return Promise.resolve({n: context.state.n * 2});
    };

    const newState = await resolve(context, doublePromise);

    st.same(newState, {n: 6});
    st.end();
  });


  suite.test('non-returning result', async (st) => {
    const context = {
      state: {n: 3}, actions: { // simulating compiled action
        incN() {
          context.state = {n: context.state.n + 1}
        }
      }
    };

    const calling = (context) => {
      context.actions.incN();
    };

    const newState = await resolve(context, calling);
    st.ok(typeof newState === 'undefined');
    st.same(context.state, {n: 4});
    st.end();
  });

  suite.end();
});
