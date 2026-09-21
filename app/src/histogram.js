export const HISTOGRAM_BINS = 128;

export function emptyHistogram() {
  return {
    r: new Array(HISTOGRAM_BINS).fill(0),
    g: new Array(HISTOGRAM_BINS).fill(0),
    b: new Array(HISTOGRAM_BINS).fill(0),
    lum: new Array(HISTOGRAM_BINS).fill(0),
  };
}

export function computeHistogramFromImage(image, maxWidth = 256) {
  const width = Math.max(1, Math.min(maxWidth, image.naturalWidth || image.width || 1));
  const height = Math.max(1, Math.round(width * (image.naturalHeight || image.height || 1) / (image.naturalWidth || image.width || 1)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const bins = emptyHistogram();
  for (let index = 0; index < data.length; index += 4) {
    bins.r[Math.min(HISTOGRAM_BINS - 1, Math.floor(data[index] / 2))] += 1;
    bins.g[Math.min(HISTOGRAM_BINS - 1, Math.floor(data[index + 1] / 2))] += 1;
    bins.b[Math.min(HISTOGRAM_BINS - 1, Math.floor(data[index + 2] / 2))] += 1;
    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    bins.lum[Math.min(HISTOGRAM_BINS - 1, Math.floor(luminance / 2))] += 1;
  }
  return bins;
}

export function histogramPath(bins, width = 128, height = 52, fill = false) {
  if (!bins?.length) return '';
  const max = Math.max(1, ...bins);
  const points = bins.map((value, index) => {
    const x = (index / (bins.length - 1)) * width;
    const y = height - (value / max) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${points.join(' L ')}`;
  return fill ? `${line} L ${width},${height} L 0,${height} Z` : line;
}
