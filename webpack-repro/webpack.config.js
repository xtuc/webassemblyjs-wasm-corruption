const
    path = require('path'),
    FlagDependencyUsagePlugin = require('webpack/lib/FlagDependencyUsagePlugin'),
    HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: {
        main: path.resolve(__dirname, './src/index.js')
    },
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: '[name].js'
    },
    resolve: {
        extensions: ['.js', '.wasm']
    },
    devtool: false,
    mode: 'development',
    plugins: [
        new HtmlWebpackPlugin({
            title: 'WASM Corruption'
        }),
        // Or instead of including explicitly, you can set mode to 'production'
        new FlagDependencyUsagePlugin()
    ]
};
