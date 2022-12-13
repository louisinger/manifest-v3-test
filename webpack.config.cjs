const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { ProvidePlugin } = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  devtool: 'cheap-module-source-map',
  experiments: {
    topLevelAwait: true,
  },
  entry: {
    'popup-script': './src/popup-script.cjs',
    'background': './src/background.ts',
  },
  module: {
    rules: [
      { test: /\.wasm$/, type: 'asset/inline' },
      { test: /\.tsx?$/, loader: 'ts-loader', options: { configFile: 'tsconfig.json', allowTsInNodeModules: true } },
    ],
  },
  resolve: {
    fallback: {
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "path": require.resolve("path-browserify"),
      "fs": false,
    },
     alias: {
      "./wasm_loader.js": path.resolve(__dirname, 'src/ecclib.ts'),
      "./wasm_loader.browser.js": path.resolve(__dirname, 'src/ecclib.ts'),
      "tiny-secp256k1-lib": path.resolve(__dirname, 'node_modules/tiny-secp256k1/lib'),
    },
    extensions: ['.ts', '.js', '.wasm'],
  },
  plugins: [
    new ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    new CleanWebpackPlugin({ cleanStaleWebpackAssets: false }),
    new CopyWebpackPlugin({
      patterns: [
        { from: './public' },
      ],
    }),
  ],
  output: { filename: '[name].js', path: path.resolve(__dirname, 'dist') },
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
};
