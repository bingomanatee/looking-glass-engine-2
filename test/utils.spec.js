const tap = require('tap');
const _ = require('lodash');

const {capFirst, nameRegex} = require('./../lib/index');

tap.test('utils', (suite) => {
  suite.test('capFirst', (cf) => {
    cf.equal(capFirst('a'), 'A');
    cf.equal(capFirst('long'), 'Long');
    cf.equal(capFirst('NAme'), 'NAme');

    cf.end();
  });

  suite.end();
});
