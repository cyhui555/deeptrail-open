import type { CheckinItem } from '@/types';

type PoiDisplaySource = Pick<
  CheckinItem,
  'poiName' | 'poiAddress' | 'description' | 'isCustom'
>;

export interface PoiDisplayFields {
  /** 时段色块中的主要行程内容。 */
  primaryContent: string | null;
  /** 下方地点行中的地点名称或地址。 */
  locationLabel: string;
  /** 时段色块元信息中的地址；已下沉到地点行时为空。 */
  addressMeta: string | null;
  /** 主要内容与地点不重复时显示独立地点行。 */
  showLocationCard: boolean;
}

/**
 * 将行程内容与地点映射到稳定的视觉层级。
 *
 * 自定义项允许只填写一个名称并通过地图补充地址。此时名称表达“做什么”，
 * 地址表达“去哪里”，必须避免把地址放在主内容区、名称反而放到地点行。
 */
export function getPoiDisplayFields(item: PoiDisplaySource): PoiDisplayFields {
  const poiName = item.poiName.trim();
  const description = item.description?.trim() || null;
  const address = item.poiAddress?.trim() || null;
  const useCustomFallbackOrder = Boolean(item.isCustom && !description && address);
  const primaryContent = description ?? (useCustomFallbackOrder ? poiName : null);
  const locationLabel = useCustomFallbackOrder ? (address ?? poiName) : poiName;

  return {
    primaryContent,
    locationLabel,
    addressMeta: useCustomFallbackOrder ? null : address,
    showLocationCard: locationLabel !== primaryContent,
  };
}
