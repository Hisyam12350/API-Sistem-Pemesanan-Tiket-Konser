const QRCode = require('qrcode');

// Generate SVG string (untuk embed di HTML/e-ticket) - async
async function generateSVG(kodeUnik, options = {}) {
  return QRCode.toString(kodeUnik, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    width: options.width || 300,
    height: options.height || 300,
    color: {
      dark: options.darkColor || '#1a1a1a',
      light: options.lightColor || '#ffffff'
    },
    margin: options.margin || 2
  });
}

// Generate PNG buffer (untuk download file) - async
async function generatePNGBuffer(kodeUnik, options = {}) {
  return QRCode.toBuffer(kodeUnik, {
    type: 'png',
    errorCorrectionLevel: 'M',
    width: options.width || 300,
    height: options.height || 300,
    color: {
      dark: options.darkColor || '#000000',
      light: options.lightColor || '#ffffff'
    }
  });
}

// Generate Data URL string (untuk direct img src)
async function generateQRCodeDataURL(kodeUnik, options = {}) {
  return QRCode.toDataURL(kodeUnik, {
    errorCorrectionLevel: 'M',
    width: options.width || 300,
    margin: options.margin || 2
  });
}

module.exports = {
  generateSVG,
  generatePNGBuffer,
  generateQRCodeSVG: generateSVG,
  generateQRCodeDataURL
};