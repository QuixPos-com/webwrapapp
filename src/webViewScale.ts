const TABLET_MIN_DIAGONAL_INCHES = 7
const PHONE_SCALE = 0.65
const TABLET_SCALE = 0.85

/** RN layout size is in dp; 160 dp is defined as ~1 inch on any screen density. */
function getScreenDiagonalInches(width: number, height: number): number {
  return Math.sqrt(width * width + height * height) / 160
}

function getWebViewScaleForDiagonalInches(diagonalInches: number): number {
  return diagonalInches >= TABLET_MIN_DIAGONAL_INCHES ? TABLET_SCALE : PHONE_SCALE
}

export function getWebViewScaleForWindow(width: number, height: number): number {
  return getWebViewScaleForDiagonalInches(getScreenDiagonalInches(width, height))
}

// Viewport scale (not CSS zoom) so clientWidth/clientHeight/innerHeight stay consistent with the visible area.
export function buildApplyWebViewScaleJs(scale: number): string {
  return `
    (function () {
      var scale = ${scale};
      document.documentElement.style.zoom = '';
      if (document.body) document.body.style.zoom = '';
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        document.head.appendChild(meta);
      }
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=' + scale +
        ', minimum-scale=' + scale +
        ', maximum-scale=' + scale +
        ', user-scalable=no'
      );
      window.dispatchEvent(new Event('resize'));
    })();
    true;
  `
}
