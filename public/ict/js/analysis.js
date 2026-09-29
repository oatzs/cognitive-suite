(function (global) {
  'use strict';
  const ICT = global.ICT = global.ICT || {};

  ICT.mean = function (a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; };
  ICT.sd = function (a) {
    if (a.length < 2) return 0;
    const m = ICT.mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
  };
  ICT.median = function (a) {
    const s = [...a].sort((x, y) => x - y);
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  ICT.fmt = function (x, digits) {
    if (x == null || !isFinite(x)) return '—';
    return x.toFixed(digits == null ? 0 : digits);
  };
  ICT.pct = function (x) {
    if (x == null || !isFinite(x)) return '—';
    return (x * 100).toFixed(1) + '%';
  };

  ICT.randInt = function (lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); };

  /* Inverse standard-normal CDF (Acklam's rational approximation) — used for d'. */
  ICT.phiInv = function (p) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const plow = 0.02425, phigh = 1 - plow;
    let q, r, x;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= phigh) {
      q = p - 0.5; r = q * q;
      x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    return x;
  };

  /* Sensitivity index d' = z(hit) - z(false alarm), log-linear corrected at the edges. */
  ICT.dprime = function (hitRate, faRate) {
    const eps = 1e-6;
    const h = Math.min(Math.max(hitRate, eps), 1 - eps);
    const f = Math.min(Math.max(faRate, eps), 1 - eps);
    return ICT.phiInv(h) - ICT.phiInv(f);
  };

})(typeof window !== 'undefined' ? window : globalThis);
