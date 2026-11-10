const QRCode = require('qrcode');

async function generateQRCodeSVG(kodeUnik, options = {}) {
  const defaultOptions = {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 300,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  };
  return QRCode.toString(kodeUnik, { ...defaultOptions, ...options });
}

async function generateQRCodePNG(kodeUnik, options = {}) {
  const defaultOptions = {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 300,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  };
  return QRCode.toBuffer(kodeUnik, { ...defaultOptions, ...options });
}

async function generateQRCodeDataURL(kodeUnik, options = {}) {
  const defaultOptions = {
    type: 'image/png',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 300,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  };
  return QRCode.toDataURL(kodeUnik, { ...defaultOptions, ...options });
}

module.exports = {
  generateQRCodeSVG,
  generateQRCodePNG,
  generateQRCodeDataURL
};