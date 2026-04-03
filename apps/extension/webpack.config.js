const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = (env, argv) => ({
  entry: {
    'background/service-worker': './src/background/service-worker.ts',
    'content/interceptor': './src/content/interceptor.ts',
    'popup/popup': './src/popup/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  mode: argv.mode || 'production',
  devtool: argv.mode === 'development' ? 'inline-source-map' : false,
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.js$/,
        resolve: { fullySpecified: false },
      },
      {
        test: /\.css$/,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/content/styles.css', to: 'content/styles.css' },
        { from: 'icons', to: 'icons' },
        { from: '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', to: 'pdf.worker.min.mjs' },
      ],
    }),
  ],
})
