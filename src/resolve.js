import _ from 'lodash';

const LOG_DEBUG = false;

function debug(...args) {
  if (LOG_DEBUG) {
    console.log('resolve: ', ...args);
  }
}

const resolve = (context, alpha, ...args) => {
  debug('_______ context =', context, 'alpha = ', alpha);
  if (typeof alpha === 'undefined') {
    debug('... undefined');
    return;
  }
  if (_.isFunction(alpha)) {
    debug('... calling fn -', alpha.toString());
    return resolve(context, alpha(context, ...args));
  }

  if (Promise.resolve(alpha) === alpha) { // i.e., alpha is a promise
    debug('... unwrapping promise');
    return alpha.then((value, ...pArgs) => {
      return resolve(context, value, ...pArgs);
    })
  }

  debug(': result = ', alpha);
  return alpha;
};

export default resolve;
