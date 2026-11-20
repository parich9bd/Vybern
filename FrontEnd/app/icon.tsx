import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{ alignItems: 'center', background: '#11100e', color: '#c8a76b', display: 'flex', fontFamily: 'serif', fontSize: 42, height: '100%', justifyContent: 'center', width: '100%' }}>V</div>,
    size,
  );
}
