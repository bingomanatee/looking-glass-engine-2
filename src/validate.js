import is from "is";

/**
 * this function takes a test = an array of criteria or a single one --
 * and throws any validation failures.
 *
 * @param test
 * @param value
 */
const validate = (test, value) => {
  if (Array.isArray(test)) {
    test.forEach(typeItem => {
      validate(typeItem, value);
    })
  }

  if (is.function(test)) {
    if (!test(value)) {
      throw new Error('bad set Attempt for ' + name + ': failed test  ' + test.toString());
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
