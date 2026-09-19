import React from 'react';
import CameraControlPanel from '../components/CameraControlPanel.jsx';

/**
 * 独立参数页。实际控件与实时取景页里的参数抽屉共用同一个组件，
 * 避免两处实现漂移。
 */
export default function ControlScreen() {
  return <CameraControlPanel />;
}
