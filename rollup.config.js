import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

module.exports = {
  input: 'src/index.js',
  plugins: [resolve(),
    commonjs()],
  output: {
    file: 'lib/index.js',
    format: 'umd',
    name: 'LGE',
  },
};
