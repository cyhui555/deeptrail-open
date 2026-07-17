import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { CheckinItem, CheckinTask } from '@/types';

/** 地图标注点在封面快照上的相对坐标（0-1）。 */
export interface MapMarkerPosition {
  seq: number;
  name: string;
  /** 相对图片宽度的比例（0-1）。 */
  x: number;
  /** 相对图片高度的比例（0-1）。 */
  y: number;
}

/** PDF 内容输入。 */
export interface PdfInput {
  /** 行程标题。 */
  title: string;
  /** 目的地。 */
  destination?: string;
  /** 日期范围，如 "2026-07-10 ~ 2026-07-12"。 */
  dateRange?: string;
  /** 地图快照 base64 PNG；null 表示无地图（降级）。 */
  mapSnapshot?: string | null;
  /** 按天的打卡任务列表。 */
  tasks: CheckinTask[];
  /** 地图标注点图例（序号与 POI 名称对照）。 */
  mapLegend?: { seq: number; name: string }[];
  /** 标注点在图片上的相对坐标（0-1），用于绘制路线连线。 */
  mapMarkerPositions?: MapMarkerPosition[];
}

/** A4 尺寸（毫米）。 */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * A4 在 96dpi 下约为 794 × 1123px。每页固定同一画布尺寸，
 * 防止长行程被整体缩小后出现字号过小或内容越出纸张的问题。
 */
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;
const PAGE_PADDING_X_PX = 48;
const PAGE_CONTENT_TOP_PX = 52;
const PAGE_CONTENT_BOTTOM_PX = 72;
const PAGE_CONTENT_WIDTH_PX = PAGE_WIDTH_PX - PAGE_PADDING_X_PX * 2;
const PAGE_CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - PAGE_CONTENT_TOP_PX - PAGE_CONTENT_BOTTOM_PX;
const BLOCK_GAP_PX = 12;
const COVER_LEGEND_LIMIT = 14;
const INDEX_ITEMS_PER_PAGE = 24;
const TEXT_CHUNK_LENGTH = 300;

/** PDF 使用页面现有的暖纸张与矿物蓝品牌令牌。 */
const PDF_THEME = {
  paper: '#f1e7d8',
  surface: '#fcf8f0',
  surfaceMuted: '#eadcc8',
  border: '#ddcdb8',
  text: '#211c17',
  muted: '#776754',
  subtle: '#a18e78',
  accent: '#2b6595',
  accentStrong: '#234665',
  accentSoft: '#e2eff9',
  accentBorder: '#c4def0',
  white: '#fffaf3',
} as const;

const BODY_FONT = 'var(--font-app), "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const EDITORIAL_FONT = '"Songti SC", "STSong", "Noto Serif CJK SC", "SimSun", serif';

interface PdfPageDom {
  root: HTMLDivElement;
  content: HTMLDivElement;
  footerLabel: string;
}

interface MeasuredBlock {
  element: HTMLElement;
  height: number;
}

/** 为元素批量写入内联样式，确保离屏渲染不依赖页面 CSS 加载顺序。 */
function styleElement(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

/** 创建带固定 A4 比例、可用内容区和品牌底纹的 PDF 页面。 */
function createPdfPage(footerLabel: string): PdfPageDom {
  const root = document.createElement('div');
  styleElement(root, {
    width: `${PAGE_WIDTH_PX}px`,
    height: `${PAGE_HEIGHT_PX}px`,
    position: 'relative',
    overflow: 'hidden',
    boxSizing: 'border-box',
    color: PDF_THEME.text,
    fontFamily: BODY_FONT,
    background: `linear-gradient(145deg, ${PDF_THEME.surface} 0%, ${PDF_THEME.paper} 100%)`,
  });

  const accentLine = document.createElement('div');
  styleElement(accentLine, {
    position: 'absolute',
    top: '0',
    right: '0',
    left: '0',
    height: '7px',
    backgroundColor: PDF_THEME.accent,
  });
  root.appendChild(accentLine);

  const content = document.createElement('div');
  content.dataset.pdfContent = 'true';
  styleElement(content, {
    position: 'absolute',
    top: `${PAGE_CONTENT_TOP_PX}px`,
    right: `${PAGE_PADDING_X_PX}px`,
    bottom: `${PAGE_CONTENT_BOTTOM_PX}px`,
    left: `${PAGE_PADDING_X_PX}px`,
    width: `${PAGE_CONTENT_WIDTH_PX}px`,
    height: `${PAGE_CONTENT_HEIGHT_PX}px`,
    boxSizing: 'border-box',
  });
  root.appendChild(content);

  return { root, content, footerLabel };
}

/** 页面全部确定后再写页码，避免分页过程中出现错误总页数。 */
function appendPageFooter(page: PdfPageDom, pageNumber: number, totalPages: number): void {
  const footer = document.createElement('div');
  styleElement(footer, {
    position: 'absolute',
    right: `${PAGE_PADDING_X_PX}px`,
    bottom: '20px',
    left: `${PAGE_PADDING_X_PX}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: `1px solid ${PDF_THEME.border}`,
    paddingTop: '10px',
    color: PDF_THEME.muted,
    fontSize: '12px',
    lineHeight: '1.2',
  });

  const label = document.createElement('span');
  label.textContent = page.footerLabel;
  const count = document.createElement('span');
  count.textContent = `${pageNumber} / ${totalPages}`;
  footer.append(label, count);
  page.root.appendChild(footer);
}

/**
 * 生成旅行手册 PDF 并触发浏览器下载。
 *
 * <p>中文内容继续通过 html2canvas 保真渲染；每个离屏 DOM 都是固定 A4 比例。
 * 单日内容先按实际高度分配到多个页面，禁止把任意高度的长图缩放进一页。
 *
 * @throws 分页溢出、渲染或保存失败时抛出异常，由调用方展示错误。
 */
export async function generateAndDownloadPdf(input: PdfInput): Promise<void> {
  if ('fonts' in document) {
    await document.fonts.ready;
  }

  const pages: PdfPageDom[] = [...buildCoverPages(input)];
  for (let i = 0; i < input.tasks.length; i += 1) {
    pages.push(...await buildDayPages(input.tasks[i], i));
  }

  pages.forEach((page, index) => appendPageFooter(page, index + 1, pages.length));

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({
    title: input.title,
    subject: '旅迹旅行手册',
    creator: '旅迹',
  });

  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage();
    await renderDomToPdfPage(pdf, pages[index].root);
  }

  const safeName = input.title.replace(/[/\\?%*:|"<>]/g, '_');
  pdf.save(`${safeName}_旅行手册.pdf`);
}

/** 将固定 A4 DOM 渲染为当前 PDF 页，并在渲染前阻止任何静默裁切。 */
async function renderDomToPdfPage(pdf: jsPDF, dom: HTMLElement): Promise<void> {
  const mount = document.createElement('div');
  styleElement(mount, {
    position: 'fixed',
    top: '0',
    left: '-12000px',
    width: `${PAGE_WIDTH_PX}px`,
    height: `${PAGE_HEIGHT_PX}px`,
    pointerEvents: 'none',
  });
  mount.appendChild(dom);
  document.body.appendChild(mount);

  try {
    await waitForImages(dom);
    const content = dom.querySelector<HTMLElement>('[data-pdf-content="true"]');
    if (content && content.scrollHeight > content.clientHeight + 2) {
      throw new Error('PDF 页面内容超出 A4 安全区域，请缩短单个超长字段后重试');
    }

    const canvas = await html2canvas(dom, {
      width: PAGE_WIDTH_PX,
      height: PAGE_HEIGHT_PX,
      scale: 2,
      useCORS: true,
      backgroundColor: PDF_THEME.paper,
      logging: false,
    });
    const imageData = canvas.toDataURL('image/png');
    pdf.addImage(imageData, 'PNG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST');

    // 及时释放多页导出中的大画布，避免长行程占用过多浏览器内存。
    canvas.width = 1;
    canvas.height = 1;
  } finally {
    mount.remove();
  }
}

/** 等待 data URL 或同源地图图片解码，避免 PDF 中出现空白地图。 */
async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    if (typeof image.decode === 'function') {
      await image.decode().catch(() => undefined);
      return;
    }
    await new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  }));
}

/** 构建封面；图例过多时把剩余地点放到独立路线索引页。 */
function buildCoverPages(input: PdfInput): PdfPageDom[] {
  const cover = createPdfPage('旅迹 / 旅行手册');
  styleElement(cover.content, {
    display: 'flex',
    flexDirection: 'column',
  });

  const brand = document.createElement('div');
  styleElement(brand, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '26px',
  });

  const brandMark = document.createElement('div');
  styleElement(brandMark, {
    width: '42px',
    height: '42px',
    display: 'flex',
    flexShrink: '0',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    color: PDF_THEME.white,
    backgroundColor: PDF_THEME.accent,
    fontFamily: EDITORIAL_FONT,
    fontSize: '22px',
    fontWeight: '700',
  });
  brandMark.textContent = '旅';

  const brandCopy = document.createElement('div');
  const brandName = document.createElement('div');
  styleElement(brandName, {
    color: PDF_THEME.accentStrong,
    fontFamily: EDITORIAL_FONT,
    fontSize: '20px',
    fontWeight: '700',
    lineHeight: '1.2',
  });
  brandName.textContent = '旅迹';
  const brandCaption = document.createElement('div');
  styleElement(brandCaption, {
    marginTop: '3px',
    color: PDF_THEME.muted,
    fontSize: '13px',
  });
  brandCaption.textContent = '旅行手册';
  brandCopy.append(brandName, brandCaption);
  brand.append(brandMark, brandCopy);
  cover.content.appendChild(brand);

  const title = document.createElement('h1');
  const titleLength = Array.from(input.title).length;
  styleElement(title, {
    margin: '0',
    maxWidth: '650px',
    color: PDF_THEME.text,
    fontFamily: EDITORIAL_FONT,
    fontSize: titleLength > 34 ? '32px' : titleLength > 20 ? '38px' : '46px',
    fontWeight: '700',
    letterSpacing: '-0.035em',
    lineHeight: '1.18',
    overflowWrap: 'anywhere',
  });
  title.textContent = input.title;
  cover.content.appendChild(title);

  const meta = buildCoverMeta(input);
  styleElement(meta, { marginTop: '16px', marginBottom: '24px' });
  cover.content.appendChild(meta);

  const mapBlock = buildCoverMap(input.mapSnapshot ?? null);
  cover.content.appendChild(mapBlock);

  const allLegend = input.mapLegend ?? [];
  const legendFitsCover = allLegend.length <= COVER_LEGEND_LIMIT;
  const visibleLegend = legendFitsCover ? allLegend : [];
  if (visibleLegend.length > 0) {
    const legend = buildLegendGrid(visibleLegend, '路线地点');
    styleElement(legend, { marginTop: '16px' });
    cover.content.appendChild(legend);
  } else if (allLegend.length > 0) {
    const summary = buildLegendSummary(allLegend.length);
    styleElement(summary, { marginTop: '16px' });
    cover.content.appendChild(summary);
  }

  const indexLegend = legendFitsCover ? [] : allLegend;
  return [cover, ...buildLegendIndexPages(indexLegend, input.title)];
}

function buildCoverMeta(input: PdfInput): HTMLDivElement {
  const meta = document.createElement('div');
  styleElement(meta, {
    display: 'grid',
    gridTemplateColumns: input.destination && input.dateRange ? '1fr 1fr' : '1fr',
    gap: '12px',
  });

  if (input.destination) meta.appendChild(buildMetaField('目的地', input.destination));
  if (input.dateRange) meta.appendChild(buildMetaField('日期', input.dateRange));
  if (!input.destination && !input.dateRange) {
    meta.appendChild(buildMetaField('行程', `${input.tasks.length} 天旅行计划`));
  }
  return meta;
}

function buildMetaField(labelText: string, valueText: string): HTMLDivElement {
  const field = document.createElement('div');
  styleElement(field, {
    minWidth: '0',
    borderLeft: `3px solid ${PDF_THEME.accent}`,
    paddingLeft: '12px',
  });
  const label = document.createElement('div');
  styleElement(label, {
    color: PDF_THEME.muted,
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1.3',
  });
  label.textContent = labelText;
  const value = document.createElement('div');
  styleElement(value, {
    marginTop: '4px',
    color: PDF_THEME.accentStrong,
    fontSize: '16px',
    fontWeight: '700',
    lineHeight: '1.45',
    overflowWrap: 'anywhere',
  });
  value.textContent = valueText;
  field.append(label, value);
  return field;
}

function buildCoverMap(mapSnapshot: string | null): HTMLDivElement {
  const wrapper = document.createElement('div');
  styleElement(wrapper, {
    position: 'relative',
    width: '100%',
    height: mapSnapshot ? '360px' : '350px',
    flexShrink: '0',
    overflow: 'hidden',
    boxSizing: 'border-box',
    border: `1px solid ${PDF_THEME.border}`,
    borderRadius: '12px',
    backgroundColor: PDF_THEME.surfaceMuted,
  });

  if (mapSnapshot) {
    const image = document.createElement('img');
    image.src = mapSnapshot;
    image.alt = '';
    styleElement(image, {
      width: '100%',
      height: '100%',
      display: 'block',
      objectFit: 'cover',
    });
    wrapper.appendChild(image);
    return wrapper;
  }

  const placeholder = document.createElement('div');
  styleElement(placeholder, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    textAlign: 'center',
  });
  const placeholderTitle = document.createElement('strong');
  styleElement(placeholderTitle, {
    color: PDF_THEME.accentStrong,
    fontFamily: EDITORIAL_FONT,
    fontSize: '24px',
  });
  placeholderTitle.textContent = '路线地图暂未生成';
  const placeholderText = document.createElement('span');
  styleElement(placeholderText, {
    marginTop: '10px',
    maxWidth: '440px',
    color: PDF_THEME.muted,
    fontSize: '15px',
    lineHeight: '1.65',
  });
  placeholderText.textContent = '地点与每日安排仍会完整收录，可在地图坐标补齐后重新导出。';
  placeholder.append(placeholderTitle, placeholderText);
  wrapper.appendChild(placeholder);
  return wrapper;
}

function buildLegendSummary(total: number): HTMLDivElement {
  const summary = document.createElement('div');
  styleElement(summary, {
    border: `1px solid ${PDF_THEME.accentBorder}`,
    borderRadius: '12px',
    padding: '14px 16px',
    color: PDF_THEME.accentStrong,
    backgroundColor: PDF_THEME.accentSoft,
    fontSize: '14px',
    fontWeight: '700',
  });
  summary.textContent = `本次路线共 ${total} 个地点，完整编号见后续路线索引。`;
  return summary;
}

function buildLegendGrid(
  items: { seq: number; name: string }[],
  titleText: string,
): HTMLDivElement {
  const box = document.createElement('div');
  styleElement(box, {
    border: `1px solid ${PDF_THEME.border}`,
    borderRadius: '12px',
    padding: '14px 16px',
    backgroundColor: 'rgba(252, 248, 240, 0.88)',
  });

  const title = document.createElement('div');
  styleElement(title, {
    marginBottom: '10px',
    color: PDF_THEME.accentStrong,
    fontSize: '14px',
    fontWeight: '700',
  });
  title.textContent = `${titleText}（${items.length}）`;
  box.appendChild(title);

  const grid = document.createElement('div');
  styleElement(grid, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    columnGap: '22px',
    rowGap: '8px',
  });

  for (const item of items) {
    const row = document.createElement('div');
    styleElement(row, {
      minWidth: '0',
      display: 'grid',
      gridTemplateColumns: '24px minmax(0, 1fr)',
      alignItems: 'start',
      gap: '8px',
      color: PDF_THEME.text,
      fontSize: '13px',
      lineHeight: '1.45',
    });
    const badge = document.createElement('span');
    styleElement(badge, {
      width: '22px',
      height: '22px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '7px',
      color: PDF_THEME.white,
      backgroundColor: PDF_THEME.accent,
      fontSize: '11px',
      fontWeight: '700',
      lineHeight: '1',
    });
    badge.textContent = String(item.seq);
    const name = document.createElement('span');
    styleElement(name, {
      minWidth: '0',
      paddingTop: '2px',
      overflowWrap: 'anywhere',
    });
    name.textContent = item.name;
    row.append(badge, name);
    grid.appendChild(row);
  }
  box.appendChild(grid);
  return box;
}

/** 封面容不下的图例完整进入索引页，不使用省略号丢失地点名称。 */
function buildLegendIndexPages(
  items: { seq: number; name: string }[],
  tripTitle: string,
): PdfPageDom[] {
  const pages: PdfPageDom[] = [];
  for (let start = 0; start < items.length; start += INDEX_ITEMS_PER_PAGE) {
    const page = createPdfPage('旅迹 / 路线索引');
    const heading = buildSectionHeading(
      '路线索引',
      tripTitle,
      start > 0 ? '续页' : undefined,
    );
    page.content.appendChild(heading);
    const grid = buildLegendGrid(items.slice(start, start + INDEX_ITEMS_PER_PAGE), '本页地点');
    styleElement(grid, { marginTop: '24px' });
    page.content.appendChild(grid);
    pages.push(page);
  }
  return pages;
}

/** 根据块的真实高度为单日行程创建一页或多页。 */
async function buildDayPages(task: CheckinTask, dayIndex: number): Promise<PdfPageDom[]> {
  const blocks = buildDayBlocks(task);
  const firstHeaderHeight = await measureElement(buildDayHeader(task, dayIndex, false));
  const continuationHeaderHeight = await measureElement(buildDayHeader(task, dayIndex, true));
  const measuredBlocks = await measureElements(blocks);

  const pages: PdfPageDom[] = [];
  let current = createDayPage(task, dayIndex, false);
  let usedHeight = firstHeaderHeight;
  let bodyBlockCount = 0;

  for (const block of measuredBlocks) {
    const requiredHeight = BLOCK_GAP_PX + block.height;
    if (bodyBlockCount > 0 && usedHeight + requiredHeight > PAGE_CONTENT_HEIGHT_PX) {
      pages.push(current);
      current = createDayPage(task, dayIndex, true);
      usedHeight = continuationHeaderHeight;
      bodyBlockCount = 0;
    }

    if (usedHeight + requiredHeight > PAGE_CONTENT_HEIGHT_PX) {
      throw new Error(`第 ${task.dayNumber} 天存在无法安全分页的超长内容`);
    }

    styleElement(block.element, { marginTop: `${BLOCK_GAP_PX}px` });
    current.content.appendChild(block.element);
    usedHeight += requiredHeight;
    bodyBlockCount += 1;
  }

  pages.push(current);
  return pages;
}

function createDayPage(task: CheckinTask, dayIndex: number, continued: boolean): PdfPageDom {
  const page = createPdfPage(`旅迹 / 第 ${task.dayNumber} 天`);
  page.content.appendChild(buildDayHeader(task, dayIndex, continued));
  return page;
}

function buildDayHeader(task: CheckinTask, _dayIndex: number, continued: boolean): HTMLDivElement {
  const header = document.createElement('div');
  styleElement(header, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    boxSizing: 'border-box',
    border: `1px solid ${PDF_THEME.accentBorder}`,
    borderRadius: '12px',
    padding: continued ? '14px 18px' : '18px 20px',
    color: PDF_THEME.accentStrong,
    backgroundColor: PDF_THEME.accentSoft,
  });

  const copy = document.createElement('div');
  styleElement(copy, { minWidth: '0' });
  const title = document.createElement('h2');
  styleElement(title, {
    margin: '0',
    color: PDF_THEME.accentStrong,
    fontFamily: EDITORIAL_FONT,
    fontSize: continued ? '22px' : '28px',
    fontWeight: '700',
    lineHeight: '1.25',
  });
  title.textContent = `第 ${task.dayNumber} 天${continued ? '（续）' : ''}`;
  copy.appendChild(title);

  const context = [task.itineraryDate, task.theme].filter(Boolean).join(' / ');
  if (context) {
    const subtitle = document.createElement('p');
    styleElement(subtitle, {
      margin: '5px 0 0',
      color: PDF_THEME.muted,
      fontSize: '14px',
      lineHeight: '1.5',
      overflowWrap: 'anywhere',
    });
    subtitle.textContent = context;
    copy.appendChild(subtitle);
  }

  const progress = document.createElement('div');
  styleElement(progress, {
    flexShrink: '0',
    color: PDF_THEME.accentStrong,
    fontSize: '13px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
  });
  const visibleItems = task.items.filter((item) => item.status !== 'ABANDONED');
  progress.textContent = `${visibleItems.length} 个地点`;
  header.append(copy, progress);
  return header;
}

function buildDayBlocks(task: CheckinTask): HTMLElement[] {
  const items = task.items.filter((item) => item.status !== 'ABANDONED');
  const blocks = items.length > 0
    ? items.flatMap((item) => buildItemCardSegments(item))
    : [buildEmptyDayBlock()];

  const summaryBlocks = buildDaySummaryBlocks(task);
  if (summaryBlocks.length > 0) {
    blocks.push(buildSummaryHeading(), ...summaryBlocks);
  }
  return blocks;
}

/** 长描述按自然标点拆成续写卡片，正常卡片始终作为完整块分页。 */
function buildItemCardSegments(item: CheckinItem): HTMLDivElement[] {
  const descriptionChunks = splitReadableText(item.description ?? '', TEXT_CHUNK_LENGTH);
  if (descriptionChunks.length === 0) return [buildItemCard(item, undefined, false)];

  return descriptionChunks.map((description, index) => (
    buildItemCard(item, description, index > 0)
  ));
}

function buildItemCard(
  item: CheckinItem,
  description: string | undefined,
  continued: boolean,
): HTMLDivElement {
  const card = document.createElement('div');
  styleElement(card, {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${PDF_THEME.border}`,
    borderRadius: '12px',
    padding: '17px 18px',
    backgroundColor: PDF_THEME.surface,
  });

  const titleRow = document.createElement('div');
  styleElement(titleRow, {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
  });

  if (item.period && !continued) {
    const period = document.createElement('span');
    styleElement(period, {
      flexShrink: '0',
      borderRadius: '7px',
      padding: '4px 8px',
      color: PDF_THEME.accentStrong,
      backgroundColor: PDF_THEME.accentSoft,
      fontSize: '12px',
      fontWeight: '700',
      lineHeight: '1.2',
    });
    period.textContent = item.period;
    titleRow.appendChild(period);
  }

  const name = document.createElement('h3');
  styleElement(name, {
    minWidth: '0',
    margin: '0',
    color: PDF_THEME.text,
    fontFamily: EDITORIAL_FONT,
    fontSize: '19px',
    fontWeight: '700',
    lineHeight: '1.35',
    overflowWrap: 'anywhere',
  });
  name.textContent = `${item.poiName}${continued ? '（续）' : ''}`;
  titleRow.appendChild(name);
  card.appendChild(titleRow);

  if (!continued) {
    const metadata = buildItemMetadata(item);
    if (metadata) {
      styleElement(metadata, { marginTop: '10px' });
      card.appendChild(metadata);
    }

    const transport = parseTransportText(item.transportToNext);
    if (transport) {
      const transportLine = document.createElement('p');
      styleElement(transportLine, {
        margin: '10px 0 0',
        borderLeft: `3px solid ${PDF_THEME.accentBorder}`,
        paddingLeft: '10px',
        color: PDF_THEME.muted,
        fontSize: '14px',
        lineHeight: '1.55',
        overflowWrap: 'anywhere',
      });
      transportLine.textContent = `前往下一站：${transport}`;
      card.appendChild(transportLine);
    }
  }

  if (description) {
    const text = document.createElement('p');
    styleElement(text, {
      margin: '10px 0 0',
      color: PDF_THEME.muted,
      fontSize: '15px',
      lineHeight: '1.65',
      overflowWrap: 'anywhere',
      whiteSpace: 'pre-wrap',
    });
    text.textContent = description;
    card.appendChild(text);
  }

  return card;
}

function buildItemMetadata(item: CheckinItem): HTMLDivElement | null {
  const fields: Array<[string, string | undefined]> = [
    ['地址', item.poiAddress],
    ['开放', item.openingHours],
    ['游玩', item.estimatedVisitTime],
    ['门票', item.admissionFee],
    ['预算', item.estimatedCost],
    ['评分', item.rating],
  ];
  const visible = fields.filter((field): field is [string, string] => Boolean(field[1]));
  if (visible.length === 0) return null;

  const grid = document.createElement('div');
  styleElement(grid, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    columnGap: '18px',
    rowGap: '7px',
  });
  for (const [labelText, valueText] of visible) {
    const row = document.createElement('div');
    styleElement(row, {
      minWidth: '0',
      display: 'grid',
      gridTemplateColumns: '38px minmax(0, 1fr)',
      gap: '6px',
      color: PDF_THEME.muted,
      fontSize: '13px',
      lineHeight: '1.5',
    });
    const label = document.createElement('span');
    styleElement(label, { color: PDF_THEME.subtle, fontWeight: '600' });
    label.textContent = labelText;
    const value = document.createElement('span');
    styleElement(value, { overflowWrap: 'anywhere' });
    value.textContent = valueText;
    row.append(label, value);
    grid.appendChild(row);
  }
  return grid;
}

function parseTransportText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const transport = JSON.parse(raw) as { mode?: string; description?: string; durationMin?: number };
    const modeLabels: Record<string, string> = {
      WALK: '步行',
      DRIVE: '驾车',
      BUS: '公交',
      SUBWAY: '地铁',
      TRAIN: '火车',
      FLIGHT: '飞机',
    };
    const main = transport.description || (transport.mode ? modeLabels[transport.mode] || transport.mode : '');
    if (!main) return null;
    return transport.durationMin ? `${main}，约 ${transport.durationMin} 分钟` : main;
  } catch {
    return raw;
  }
}

function buildEmptyDayBlock(): HTMLDivElement {
  const block = document.createElement('div');
  styleElement(block, {
    border: `1px dashed ${PDF_THEME.border}`,
    borderRadius: '12px',
    padding: '34px',
    color: PDF_THEME.muted,
    backgroundColor: PDF_THEME.surface,
    fontSize: '15px',
    textAlign: 'center',
  });
  block.textContent = '该天暂无需要执行的行程地点。';
  return block;
}

function buildSummaryHeading(): HTMLDivElement {
  const heading = document.createElement('div');
  styleElement(heading, {
    borderTop: `1px solid ${PDF_THEME.border}`,
    paddingTop: '13px',
    color: PDF_THEME.accentStrong,
    fontFamily: EDITORIAL_FONT,
    fontSize: '18px',
    fontWeight: '700',
  });
  heading.textContent = '当日补充';
  return heading;
}

function buildDaySummaryBlocks(task: CheckinTask): HTMLDivElement[] {
  const blocks: HTMLDivElement[] = [];

  if (task.mealsJson) {
    try {
      const meals = JSON.parse(task.mealsJson) as Array<{
        type?: string;
        recommendation?: string;
        estimatedCost?: string;
      }>;
      for (const meal of meals) {
        const mealText = [meal.recommendation, meal.estimatedCost].filter(Boolean).join('，');
        splitReadableText(mealText, TEXT_CHUNK_LENGTH).forEach((chunk, index) => {
          blocks.push(buildInfoBlock(`餐饮：${meal.type || '安排'}${index > 0 ? '（续）' : ''}`, chunk));
        });
      }
    } catch {
      // 历史脏 JSON 不阻塞整份 PDF，页面与导出保持同一容错边界。
    }
  }

  if (task.accommodationJson) {
    try {
      const accommodation = JSON.parse(task.accommodationJson) as {
        name?: string;
        address?: string;
        rating?: string;
      };
      const accommodationText = [
        accommodation.name,
        accommodation.address,
        accommodation.rating ? `评分 ${accommodation.rating}` : undefined,
      ].filter(Boolean).join('，');
      splitReadableText(accommodationText, TEXT_CHUNK_LENGTH).forEach((chunk, index) => {
        blocks.push(buildInfoBlock(`住宿${index > 0 ? '（续）' : ''}`, chunk));
      });
    } catch {
      // 同上，忽略单个不可解析字段。
    }
  }

  splitReadableText(task.transportation ?? '', TEXT_CHUNK_LENGTH).forEach((chunk, index) => {
    blocks.push(buildInfoBlock(`交通${index > 0 ? '（续）' : ''}`, chunk));
  });
  splitReadableText(task.tip ?? '', TEXT_CHUNK_LENGTH).forEach((chunk, index) => {
    blocks.push(buildInfoBlock(`旅行贴士${index > 0 ? '（续）' : ''}`, chunk, true));
  });

  return blocks;
}

function buildInfoBlock(labelText: string, valueText: string, highlighted = false): HTMLDivElement {
  const block = document.createElement('div');
  styleElement(block, {
    boxSizing: 'border-box',
    border: `1px solid ${highlighted ? PDF_THEME.accentBorder : PDF_THEME.border}`,
    borderRadius: '12px',
    padding: '14px 16px',
    backgroundColor: highlighted ? PDF_THEME.accentSoft : PDF_THEME.surface,
  });
  const label = document.createElement('div');
  styleElement(label, {
    marginBottom: '5px',
    color: PDF_THEME.accentStrong,
    fontSize: '13px',
    fontWeight: '700',
  });
  label.textContent = labelText;
  const value = document.createElement('div');
  styleElement(value, {
    color: PDF_THEME.muted,
    fontSize: '14px',
    lineHeight: '1.6',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  });
  value.textContent = valueText;
  block.append(label, value);
  return block;
}

/** 在尽量靠近中文标点处切分长文本，保证字符不丢失且单块可安全分页。 */
function splitReadableText(text: string, maxLength: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const characters = Array.from(normalized);
  const chunks: string[] = [];
  let offset = 0;
  const punctuation = new Set(['。', '！', '？', '；', '，', '.', '!', '?', ';', ',']);

  while (offset < characters.length) {
    let end = Math.min(offset + maxLength, characters.length);
    if (end < characters.length) {
      const minimumEnd = offset + Math.floor(maxLength * 0.62);
      for (let cursor = end; cursor > minimumEnd; cursor -= 1) {
        if (punctuation.has(characters[cursor - 1])) {
          end = cursor;
          break;
        }
      }
    }
    const chunk = characters.slice(offset, end).join('').trim();
    if (chunk) chunks.push(chunk);
    offset = end;
  }
  return chunks;
}

/** 统一构建索引页等普通章节标题。 */
function buildSectionHeading(titleText: string, subtitleText: string, marker?: string): HTMLDivElement {
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  styleElement(title, {
    margin: '0',
    color: PDF_THEME.text,
    fontFamily: EDITORIAL_FONT,
    fontSize: '32px',
    fontWeight: '700',
    lineHeight: '1.25',
  });
  title.textContent = marker ? `${titleText}（${marker}）` : titleText;
  const subtitle = document.createElement('p');
  styleElement(subtitle, {
    margin: '8px 0 0',
    color: PDF_THEME.muted,
    fontSize: '15px',
    lineHeight: '1.55',
    overflowWrap: 'anywhere',
  });
  subtitle.textContent = subtitleText;
  heading.append(title, subtitle);
  return heading;
}

/** 以 PDF 实际内容宽度测量块，分页只依赖真实浏览器布局而非字符数猜测。 */
async function measureElements(elements: HTMLElement[]): Promise<MeasuredBlock[]> {
  const shell = document.createElement('div');
  styleElement(shell, {
    position: 'fixed',
    top: '0',
    left: '-12000px',
    width: `${PAGE_CONTENT_WIDTH_PX}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
    fontFamily: BODY_FONT,
  });

  const clones = elements.map((element) => element.cloneNode(true) as HTMLElement);
  clones.forEach((clone) => shell.appendChild(clone));
  document.body.appendChild(shell);
  try {
    await nextFrame();
    return elements.map((element, index) => ({
      element,
      height: Math.ceil(clones[index].getBoundingClientRect().height),
    }));
  } finally {
    shell.remove();
  }
}

async function measureElement(element: HTMLElement): Promise<number> {
  const [measured] = await measureElements([element]);
  return measured.height;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * 将地图底图和路线覆盖层合并为单张 PNG。
 * 路线颜色使用页面同款矿物蓝，暖白描边保证在卫星图和普通地图上均清晰。
 */
export async function mergeMapAndOverlay(
  mapSnapshot: string,
  positions: MapMarkerPosition[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = 800;
      const height = 600;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('浏览器不支持地图画布合成'));
        return;
      }
      context.drawImage(image, 0, 0, width, height);

      const points = positions.map((position) => ({
        x: position.x * width,
        y: position.y * height,
      }));

      if (points.length >= 2) {
        context.lineJoin = 'round';
        context.lineCap = 'round';
        drawRoute(context, points, PDF_THEME.white, 12);
        drawRoute(context, points, PDF_THEME.accent, 7);
      }

      for (const point of points) {
        context.beginPath();
        context.arc(point.x, point.y, 11, 0, Math.PI * 2);
        context.fillStyle = PDF_THEME.accent;
        context.fill();
        context.strokeStyle = PDF_THEME.white;
        context.lineWidth = 3;
        context.stroke();
      }

      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = PDF_THEME.white;
      context.font = `bold 16px ${BODY_FONT}`;
      points.forEach((point, index) => context.fillText(String(index + 1), point.x, point.y));
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('底图加载失败，无法合成地图标注'));
    image.src = mapSnapshot;
  });
}

function drawRoute(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  color: string,
  width: number,
): void {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}
