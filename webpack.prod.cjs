const { merge } = require('webpack-merge');
const common = require('./webpack.common.cjs');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = merge(common, {
  mode: 'production',
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          ecma: 6,
          mangle: {
            reserved: ['Buffer']
          },
        },
      }),
    ],
  },
});
