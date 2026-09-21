import {
  PTP_PROP,
  exposureTimeMicrosToLabel,
  fNumberLabel,
  nikonExposureRawToMicros,
} from './nikonProperties.js';

export const ISO_VALUES = [100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200,4000,5000,6400,8000,10000,12800,16000,20000,25600,32000,40000,51200];
export const SHUTTER_LABELS = ['30"','25"','20"','15"','13"','10"','8"','6"','5"','4"','3.2"','2.5"','2"','1.6"','1.3"','1"','1/1.3','1/1.6','1/2','1/2.5','1/3','1/4','1/5','1/6','1/8','1/10','1/13','1/15','1/20','1/25','1/30','1/40','1/50','1/60','1/80','1/100','1/125','1/160','1/200','1/250','1/320','1/400','1/500','1/640','1/800','1/1000','1/1250','1/1600','1/2000','1/2500','1/3200','1/4000'];
export const APERTURE_LABELS = ['F1.4','F1.6','F1.8','F2','F2.2','F2.5','F2.8','F3.2','F3.5','F4','F4.5','F5','F5.6','F6.3','F7.1','F8','F9','F10','F11','F13','F14','F16','F18','F20','F22'];
export const EXP_COMP_VALUES = [-5,-4.666,-4.333,-4,-3.666,-3.333,-3,-2.666,-2.333,-2,-1.666,-1.333,-1,-0.666,-0.333,0,0.333,0.666,1,1.333,1.666,2,2.333,2.666,3,3.333,3.666,4,4.333,4.666,5];
export const EXPOSURE_MODE_OPTIONS = ['M','A','S','P','AUTO','U1','U2','U3'];

function unique(values) {
  return Array.from(new Set(values));
}

function descriptorOptions(desc) {
  if (!desc || desc.responseCode !== 0x2001) return null;
  if (desc.form === 'enumeration') return desc.values;
  if (desc.form === 'range' && Number(desc.step) > 0) {
    const count = Math.floor((Number(desc.maximum) - Number(desc.minimum)) / Number(desc.step)) + 1;
    if (count > 0 && count <= 512) {
      return Array.from({ length: count }, (_, index) => Number(desc.minimum) + index * Number(desc.step));
    }
  }
  return null;
}

function knownValuesInRange(values, desc) {
  if (!desc || desc.form !== 'range') return values;
  const minimum = Number(desc.minimum);
  const maximum = Number(desc.maximum);
  return values.filter(value => Number(value) >= minimum && Number(value) <= maximum);
}

export function buildControlCatalog(descriptors = {}) {
  const isoDesc = descriptors.iso;
  const shutterDesc = descriptors.shutter;
  const apertureDesc = descriptors.aperture;

  const isoFromCamera = descriptorOptions(isoDesc);
  const apertureFromCamera = descriptorOptions(apertureDesc);
  const shutterRawFromCamera = descriptorOptions(shutterDesc);

  const isoOptions = unique(isoFromCamera || knownValuesInRange(ISO_VALUES, isoDesc));
  const apertureOptions = unique(
    (apertureFromCamera || knownValuesInRange(APERTURE_LABELS.map(label => Number(label.slice(1)) * 100), apertureDesc))
      .map(raw => fNumberLabel(raw)),
  );
  const shutterOptions = unique(
    (shutterRawFromCamera || [])
      .map(raw => exposureTimeMicrosToLabel(nikonExposureRawToMicros(raw)))
      .filter(label => label !== '--')
      .concat(SHUTTER_LABELS),
  ).sort((a, b) => {
    const indexA = SHUTTER_LABELS.indexOf(a);
    const indexB = SHUTTER_LABELS.indexOf(b);
    if (indexA >= 0 && indexB >= 0) return indexA - indexB;
    if (indexA >= 0) return -1;
    if (indexB >= 0) return 1;
    return 0;
  });

  const summary = [];
  if (isoOptions.length) summary.push({ label: 'ISO', count: isoOptions.length, range: `${isoOptions[0]}–${isoOptions[isoOptions.length - 1]}` });
  if (shutterOptions.length) summary.push({ label: '快门', count: shutterOptions.length, range: `${shutterOptions[0]}–${shutterOptions[shutterOptions.length - 1]}` });
  if (apertureOptions.length) summary.push({ label: '光圈', count: apertureOptions.length, range: `${apertureOptions[0]}–${apertureOptions[apertureOptions.length - 1]}` });

  return {
    isoOptions: isoOptions.length ? isoOptions : ISO_VALUES,
    shutterOptions: shutterOptions.length ? shutterOptions : SHUTTER_LABELS,
    apertureOptions: apertureOptions.length ? apertureOptions : APERTURE_LABELS,
    summary,
  };
}
