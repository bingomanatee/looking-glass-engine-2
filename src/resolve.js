import _ from 'lodash';
import uuid from 'uuid/v4';
const LOG_DEBUG = true;

export default async (context, fn, ...args) => {
  const id = uuid();
  const debug = (...args) => {
    if (LOG_DEBUG){
      console.log(id, 'resolve()', ...args);
    }
  };
  debug('function', fn.toString());
  let result = fn(context, ...args);
  let output = result;
  debug('result starting value', result);

  while (typeof result !== 'undefined') {
    output = result;
    if (_.isFunction(result)) {
      result = result(context);
      debug('de-functioned result:', result);
      debug(id, )
    } else {
      const delayed = await result;
      if (delayed === result) {
        break;
      } else {
        result = delayed;
        debug('de-promised result:', result);
      }
    }
  }
  debug(id, 'result(): returning -->', output);
  return output;
}
