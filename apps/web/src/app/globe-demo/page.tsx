import type { Metadata, Viewport } from 'next';
import { GlobeDemoExperience } from '@/components/globe-demo/GlobeDemoExperience';

export const metadata: Metadata = {
  title: '3D 旅行地球演示',
  description: '在可交互 3D 地球上预览跨城市旅行路线。',
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#071014',
};

export default function GlobeDemoPage() {
  return <GlobeDemoExperience />;
}
