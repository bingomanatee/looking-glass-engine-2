import is from "is";

/**
 * this function takes a test = an array of criteria or a single one --
 * and throws any validation failures.
 *
 * @param test
 * @param value
 */
const validate = (name, test, value) => {
  if (Array.isArray(test)) {
    test.forEach(typeItem => {
      validate(name, typeItem, value);
    });
    return;
  }

  if (is.function(test)) {
    try {
      test(value);
    } catch (err) {
      console.log('validation failure: ', name, test, value);
      throw err;
    }
  } else if (is.string(test)) {
    if (!is[test]) {
      throw new Error(`bad criteria for ${name}: ${test}`);
    }
    if (!is[test](value)) {
      throw new Error(`bad value set for ${name}: ${value} failed ${test}`);
    }
  } else {
    throw new Error(`bad criteria for ${name}: ${test}`);
  }
};

export default validate;
