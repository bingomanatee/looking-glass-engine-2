import is from 'is';

export default function (string) {
  if (!(string && is.string(string))) {
    throw new Error(`capFirst: bad input ${string}`)
  }
  return string[0].toUpperCase() + string.slice(1);
};
