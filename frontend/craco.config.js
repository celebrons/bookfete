// C:\Users\USER\bookfete\frontend\craco.config.js
module.exports = {
  style: {
    postcss: {
      mode: 'extends',
      loaderOptions: {
        postcssOptions: {
          ident: 'postcss',
          plugins: [
            require('postcss-flexbugs-fixes'),
            require('postcss-preset-env')({
              autoprefixer: {
                flexbox: 'no-2009',
              },
              stage: 3,
            }),
          ],
        },
      },
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      // Désactiver la minification CSS problématique
      const minimizerPlugins = webpackConfig.optimization.minimizer;
      
      // Trouver et modifier le plugin CssMinimizer
      const cssMinimizerIndex = minimizerPlugins.findIndex(
        plugin => plugin.constructor.name === 'CssMinimizerPlugin'
      );
      
      if (cssMinimizerIndex !== -1) {
        // Remplacer par une version plus tolérante
        const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
        minimizerPlugins[cssMinimizerIndex] = new CssMinimizerPlugin({
          minimizerOptions: {
            preset: [
              'default',
              {
                discardComments: { removeAll: true }, // Supprime les commentaires
                normalizeWhitespace: true,
                minifyFontValues: true,
                minifyParams: true,
                minifySelectors: true,
              },
            ],
          },
        });
      }

      return webpackConfig;
    },
  },
};