export type GlobeLayer = 'route' | 'landmarks';
export type GlobePlaceKind = 'city' | 'landmark';

export interface LocalizedName {
  zhHans: string;
  en: string;
}

export interface GlobeCountry {
  /** ISO 3166-1 alpha-2 国家码，便于后续与地图 Provider 对齐。 */
  code: string;
  name: LocalizedName;
}

export interface GlobePlaceExternalIds {
  /** 正式接入 Google Places 后保存 Place ID，不把它当作产品内部主键。 */
  googlePlaceId?: string;
  /** 开放数据源使用 Wikidata QID 做跨语言实体对齐。 */
  wikidataId?: string;
}

export interface GlobePlaceCategory {
  key: string;
  name: LocalizedName;
}

export interface GlobeLandmarkSource {
  label: string;
  url: string;
}

export interface GlobeLandmarkPhoto {
  src: string;
  alt: string;
  width: number;
  height: number;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  objectPosition?: string;
}

interface GlobePlaceBase {
  /** 稳定内部 ID。景点使用 place:landmark:<country>:<slug>。 */
  id: string;
  kind: GlobePlaceKind;
  displayCode: string;
  name: LocalizedName;
  country: GlobeCountry;
  coordinates: {
    lat: number;
    lng: number;
  };
  category: GlobePlaceCategory;
  listLabel: string;
  description: string;
}

export interface GlobeCity extends GlobePlaceBase {
  kind: 'city';
  externalIds?: GlobePlaceExternalIds;
}

export interface GlobeLandmark extends GlobePlaceBase {
  kind: 'landmark';
  city: LocalizedName;
  relatedCityId: string;
  introduction: string;
  highlights: [string, string, string];
  photo: GlobeLandmarkPhoto;
  source: GlobeLandmarkSource;
  externalIds: GlobePlaceExternalIds & {
    wikidataId: string;
  };
}

export type GlobePlace = GlobeCity | GlobeLandmark;

export interface GlobeRoute {
  id: string;
  start: GlobeCity;
  end: GlobeCity;
}

const CHINA: GlobeCountry = {
  code: 'CN',
  name: {
    zhHans: '中国',
    en: 'China',
  },
};

/**
 * 当前只使用固定示例城市，不读取真实用户行程。
 */
export const GLOBE_ROUTE_PLACES: GlobeCity[] = [
  {
    id: 'place:city:cn:shanghai',
    kind: 'city',
    displayCode: 'SHA',
    name: {
      zhHans: '上海',
      en: 'Shanghai',
    },
    country: CHINA,
    coordinates: {
      lat: 31.2304,
      lng: 121.4737,
    },
    category: {
      key: 'route-city',
      name: {
        zhHans: '路线城市',
        en: 'Route city',
      },
    },
    listLabel: '从江海启程',
    description: '从熟悉的江海交界出发，把第一段航线交给夜色。',
  },
  {
    id: 'place:city:cn:lhasa',
    kind: 'city',
    displayCode: 'LXA',
    name: {
      zhHans: '拉萨',
      en: 'Lhasa',
    },
    country: CHINA,
    coordinates: {
      lat: 29.652,
      lng: 91.1721,
    },
    category: {
      key: 'route-city',
      name: {
        zhHans: '路线城市',
        en: 'Route city',
      },
    },
    listLabel: '进入高原',
    description: '海拔抬高视线，山脉让旅行从赶路变成停留。',
  },
  {
    id: 'place:city:tr:istanbul',
    kind: 'city',
    displayCode: 'IST',
    name: {
      zhHans: '伊斯坦布尔',
      en: 'Istanbul',
    },
    country: {
      code: 'TR',
      name: {
        zhHans: '土耳其',
        en: 'Türkiye',
      },
    },
    coordinates: {
      lat: 41.0082,
      lng: 28.9784,
    },
    category: {
      key: 'route-city',
      name: {
        zhHans: '路线城市',
        en: 'Route city',
      },
    },
    listLabel: '横跨海峡',
    description: '在两片大陆之间换乘，旧城与渡轮接住下一程。',
  },
  {
    id: 'place:city:is:reykjavik',
    kind: 'city',
    displayCode: 'KEF',
    name: {
      zhHans: '雷克雅未克',
      en: 'Reykjavík',
    },
    country: {
      code: 'IS',
      name: {
        zhHans: '冰岛',
        en: 'Iceland',
      },
    },
    coordinates: {
      lat: 64.1466,
      lng: -21.9426,
    },
    category: {
      key: 'route-city',
      name: {
        zhHans: '路线城市',
        en: 'Route city',
      },
    },
    listLabel: '抵达北境',
    description: '沿北大西洋向北，风、熔岩与地热改变地表的颜色。',
  },
  {
    id: 'place:city:ca:vancouver',
    kind: 'city',
    displayCode: 'YVR',
    name: {
      zhHans: '温哥华',
      en: 'Vancouver',
    },
    country: {
      code: 'CA',
      name: {
        zhHans: '加拿大',
        en: 'Canada',
      },
    },
    coordinates: {
      lat: 49.2827,
      lng: -123.1207,
    },
    category: {
      key: 'route-city',
      name: {
        zhHans: '路线城市',
        en: 'Route city',
      },
    },
    listLabel: '山海收尾',
    description: '让山脉与海湾收住最后一段飞线，也留下继续出发的方向。',
  },
];

/**
 * 坐标与实体 ID 来自对应 Wikidata 条目。
 * 景点通过 relatedCityId 与路线城市关联，后续可直接替换为服务端地点数据。
 */
export const GLOBE_LANDMARKS: GlobeLandmark[] = [
  {
    id: 'place:landmark:cn:oriental-pearl-tower',
    kind: 'landmark',
    displayCode: '东方明珠',
    name: {
      zhHans: '东方明珠广播电视塔',
      en: 'Oriental Pearl Tower',
    },
    city: {
      zhHans: '上海',
      en: 'Shanghai',
    },
    relatedCityId: 'place:city:cn:shanghai',
    country: CHINA,
    coordinates: {
      lat: 31.2417,
      lng: 121.4947,
    },
    category: {
      key: 'observation-landmark',
      name: {
        zhHans: '城市观景地标',
        en: 'Observation landmark',
      },
    },
    externalIds: {
      wikidataId: 'Q223207',
    },
    listLabel: '城市观景地标',
    description: '位于陆家嘴的代表性城市地标，可从观景空间俯瞰黄浦江两岸。',
    introduction: '东方明珠位于浦东陆家嘴、黄浦江东岸，468 米高的球体塔身是上海天际线最具辨识度的建筑之一。不同高度的观景空间把外滩历史建筑、黄浦江与陆家嘴高楼同时纳入视野。',
    highlights: ['球体塔身', '360 度城市视野', '外滩与陆家嘴对望'],
    photo: {
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Shanghai-Skyline-52-Flusspanorama_mit_Oriental_Pearl_Tower-2012-gje.jpg/960px-Shanghai-Skyline-52-Flusspanorama_mit_Oriental_Pearl_Tower-2012-gje.jpg',
      alt: '黄浦江对岸的东方明珠广播电视塔与陆家嘴天际线',
      width: 5107,
      height: 2722,
      author: 'Gerd Eichmann',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Shanghai-Skyline-52-Flusspanorama_mit_Oriental_Pearl_Tower-2012-gje.jpg',
      objectPosition: 'center 48%',
    },
    source: {
      label: '上海市政府景点资料',
      url: 'https://english.shanghai.gov.cn/en-ScenicSpots/20231205/19a5f5184eca45728fd57a4d4c8efc61.html',
    },
  },
  {
    id: 'place:landmark:cn:potala-palace',
    kind: 'landmark',
    displayCode: '布达拉宫',
    name: {
      zhHans: '布达拉宫',
      en: 'Potala Palace',
    },
    city: {
      zhHans: '拉萨',
      en: 'Lhasa',
    },
    relatedCityId: 'place:city:cn:lhasa',
    country: CHINA,
    coordinates: {
      lat: 29.6578,
      lng: 91.1169,
    },
    category: {
      key: 'world-heritage',
      name: {
        zhHans: '世界文化遗产',
        en: 'World Heritage Site',
      },
    },
    externalIds: {
      wikidataId: 'Q71229',
    },
    listLabel: '世界文化遗产',
    description: '坐落于拉萨红山之上，是西藏宫堡式建筑群的重要代表。',
    introduction: '布达拉宫沿拉萨红山山势层层展开，红宫、白宫与附属建筑共同组成规模宏大的宫堡建筑群。建筑与拉萨河谷的高原地貌紧密结合，是理解西藏建筑、宗教与历史的重要坐标。',
    highlights: ['红宫与白宫', '高原宫堡建筑', '拉萨河谷景观'],
    photo: {
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Potala.jpg/960px-Potala.jpg',
      alt: '沿拉萨红山山势展开的布达拉宫建筑群',
      width: 2592,
      height: 1728,
      author: 'Ondřej Žváček',
      license: 'CC BY 2.5',
      licenseUrl: 'https://creativecommons.org/licenses/by/2.5',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Potala.jpg',
      objectPosition: 'center 42%',
    },
    source: {
      label: 'UNESCO 世界遗产资料',
      url: 'https://whc.unesco.org/en/list/707',
    },
  },
  {
    id: 'place:landmark:tr:hagia-sophia',
    kind: 'landmark',
    displayCode: '圣索菲亚',
    name: {
      zhHans: '圣索菲亚大教堂',
      en: 'Hagia Sophia',
    },
    city: {
      zhHans: '伊斯坦布尔',
      en: 'Istanbul',
    },
    relatedCityId: 'place:city:tr:istanbul',
    country: {
      code: 'TR',
      name: {
        zhHans: '土耳其',
        en: 'Türkiye',
      },
    },
    coordinates: {
      lat: 41.0083,
      lng: 28.98,
    },
    category: {
      key: 'historic-architecture',
      name: {
        zhHans: '历史建筑',
        en: 'Historic architecture',
      },
    },
    externalIds: {
      wikidataId: 'Q12506',
    },
    listLabel: '历史建筑',
    description: '位于伊斯坦布尔历史城区，建筑中保留拜占庭与奥斯曼时期的层次。',
    introduction: '圣索菲亚大教堂位于伊斯坦布尔历史半岛，建于 6 世纪的巨大穹顶展示了拜占庭时期的建筑与装饰成就。马赛克、石材与奥斯曼时期增建的元素在同一空间叠合，呈现城市跨越多个时代的历史层次。',
    highlights: ['巨型中央穹顶', '拜占庭建筑艺术', '多时代空间叠层'],
    photo: {
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Hagia_Sophia_Mars_2013.jpg/960px-Hagia_Sophia_Mars_2013.jpg',
      alt: '蓝天下的圣索菲亚大教堂穹顶与宣礼塔',
      width: 5514,
      height: 3681,
      author: 'Arild Vågen',
      license: 'CC BY-SA 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hagia_Sophia_Mars_2013.jpg',
      objectPosition: 'center 44%',
    },
    source: {
      label: 'UNESCO 世界遗产资料',
      url: 'https://whc.unesco.org/en/list/356',
    },
  },
  {
    id: 'place:landmark:is:hallgrimskirkja',
    kind: 'landmark',
    displayCode: '哈尔格林姆',
    name: {
      zhHans: '哈尔格林姆教堂',
      en: 'Hallgrímskirkja',
    },
    city: {
      zhHans: '雷克雅未克',
      en: 'Reykjavík',
    },
    relatedCityId: 'place:city:is:reykjavik',
    country: {
      code: 'IS',
      name: {
        zhHans: '冰岛',
        en: 'Iceland',
      },
    },
    coordinates: {
      lat: 64.1419,
      lng: -21.9269,
    },
    category: {
      key: 'city-landmark',
      name: {
        zhHans: '城市建筑地标',
        en: 'City landmark',
      },
    },
    externalIds: {
      wikidataId: 'Q271466',
    },
    listLabel: '城市建筑地标',
    description: '矗立于雷克雅未克市中心，是冰岛首都天际线中醒目的教堂建筑。',
    introduction: '哈尔格林姆教堂位于雷克雅未克市中心高地，73 米高的塔楼成为城市天际线的重要标志。立面以冰岛柱状岩、山脉与冰川为造型线索，登塔可远眺城市、群山和海面。',
    highlights: ['柱状岩立面', '73 米观景塔楼', '城市与山海全景'],
    photo: {
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Hallgr%C3%ADmskirkja%2C_Reykjav%C3%ADk%2C_Iceland%2C_20230506_1701_5380.jpg/960px-Hallgr%C3%ADmskirkja%2C_Reykjav%C3%ADk%2C_Iceland%2C_20230506_1701_5380.jpg',
      alt: '阴云下的哈尔格林姆教堂正立面与雷克雅未克街景',
      width: 3800,
      height: 3856,
      author: 'Jakub Hałun',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hallgr%C3%ADmskirkja,_Reykjav%C3%ADk,_Iceland,_20230506_1701_5380.jpg',
      objectPosition: 'center 45%',
    },
    source: {
      label: '哈尔格林姆教堂官方资料',
      url: 'https://www.hallgrimskirkja.is/en-gb/husi%C3%B0-og-sagan',
    },
  },
  {
    id: 'place:landmark:ca:stanley-park',
    kind: 'landmark',
    displayCode: '斯坦利公园',
    name: {
      zhHans: '斯坦利公园',
      en: 'Stanley Park',
    },
    city: {
      zhHans: '温哥华',
      en: 'Vancouver',
    },
    relatedCityId: 'place:city:ca:vancouver',
    country: {
      code: 'CA',
      name: {
        zhHans: '加拿大',
        en: 'Canada',
      },
    },
    coordinates: {
      lat: 49.3,
      lng: -123.14,
    },
    category: {
      key: 'urban-nature',
      name: {
        zhHans: '城市自然公园',
        en: 'Urban nature park',
      },
    },
    externalIds: {
      wikidataId: 'Q1126258',
    },
    listLabel: '城市自然公园',
    description: '位于温哥华市中心西北侧，森林、海堤与海湾景观在这里相接。',
    introduction: '斯坦利公园是温哥华第一座、规模最大的城市公园，约 400 公顷的西海岸雨林被海湾与城市环抱。海堤、林间步道、海滩和观景点让步行、骑行与自然观察在同一片城市边缘展开。',
    highlights: ['西海岸雨林', '滨海海堤', '步行与骑行路线'],
    photo: {
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Aerial_view_of_Vancouver_and_Stanley_Park%2C_2006-09-12.jpg/960px-Aerial_view_of_Vancouver_and_Stanley_Park%2C_2006-09-12.jpg',
      alt: '从空中俯瞰斯坦利公园、海湾与温哥华市中心',
      width: 3008,
      height: 2000,
      author: 'Tim',
      license: 'CC BY-SA 2.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Aerial_view_of_Vancouver_and_Stanley_Park,_2006-09-12.jpg',
      objectPosition: 'center 52%',
    },
    source: {
      label: '温哥华市政府公园资料',
      url: 'https://vancouver.ca/parks-recreation-culture/stanley-park.aspx',
    },
  },
];

export const GLOBE_PLACES: GlobePlace[] = [
  ...GLOBE_ROUTE_PLACES,
  ...GLOBE_LANDMARKS,
];

export const GLOBE_LAYER_PLACES: Record<GlobeLayer, GlobePlace[]> = {
  route: GLOBE_ROUTE_PLACES,
  landmarks: GLOBE_LANDMARKS,
};

const placeById = new Map(GLOBE_PLACES.map((place) => [place.id, place]));

function getCity(id: string) {
  const place = placeById.get(id);
  if (!place || place.kind !== 'city') {
    throw new Error(`示例路线或景点引用了不存在的城市：${id}`);
  }
  return place;
}

GLOBE_LANDMARKS.forEach((landmark) => {
  const city = getCity(landmark.relatedCityId);
  if (city.country.code !== landmark.country.code) {
    throw new Error(`景点与关联城市的国家码不一致：${landmark.id}`);
  }

  // 介绍属于用户可见合同，避免后续替换数据时退化为空文案或占位短句。
  if (landmark.introduction.trim().length < 48) {
    throw new Error(`景点介绍过短：${landmark.id}`);
  }
  if (
    landmark.highlights.length !== 3
    || landmark.highlights.some((highlight) => !highlight.trim())
    || new Set(landmark.highlights).size !== landmark.highlights.length
  ) {
    throw new Error(`景点核心看点必须是三个非空且不重复的条目：${landmark.id}`);
  }

  const sourceUrl = new URL(landmark.source.url);
  if (sourceUrl.protocol !== 'https:') {
    throw new Error(`景点资料来源必须使用 HTTPS：${landmark.id}`);
  }

  // 实景图属于可追溯内容，图片、原始文件页与许可必须同时存在。
  const photoUrls = [
    landmark.photo.src,
    landmark.photo.sourceUrl,
    landmark.photo.licenseUrl,
  ].map((value) => new URL(value));
  if (
    photoUrls.some((url) => url.protocol !== 'https:')
    || !landmark.photo.alt.trim()
    || !landmark.photo.author.trim()
    || !landmark.photo.license.trim()
    || landmark.photo.width <= 0
    || landmark.photo.height <= 0
  ) {
    throw new Error(`景点实景图缺少可核对的图片或授权信息：${landmark.id}`);
  }
});

const routePairs = GLOBE_ROUTE_PLACES.slice(1).map((place, index) => ({
  id: `route:${index + 1}`,
  startId: GLOBE_ROUTE_PLACES[index].id,
  endId: place.id,
}));

export const GLOBE_ROUTES: GlobeRoute[] = routePairs.map((route) => ({
  id: route.id,
  start: getCity(route.startId),
  end: getCity(route.endId),
}));
