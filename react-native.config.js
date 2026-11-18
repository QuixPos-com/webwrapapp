module.exports = {
  dependencies: {
    'react-native-webview': {
      platforms: {
        android: {
          packageImportPath: 'import com.webwrap.DashWebViewPackage;',
          packageInstance: 'new DashWebViewPackage()',
        },
      },
    },
  },
}
