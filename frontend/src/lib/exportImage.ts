/**
 * Saving a rendered timetable as a PNG.
 *
 * The browser will rasterise HTML if it is handed to it inside an SVG
 * `<foreignObject>`, but only if that HTML carries its own styling - the
 * stylesheet does not travel with it. So the node is cloned and the styles
 * that matter are written onto the clone as inline declarations.
 *
 * Only a curated list of properties is copied. Copying every computed
 * property works too, but produces a document large enough to be slow to
 * parse and, past a certain size, to fail to load at all.
 */

const BACKGROUND = "#ffffff";
/** Extra room for the SVG document to lay text out slightly differently. */
const OVERDRAW = 1.25;
const PADDING = 48;

const COPIED_PROPERTIES = [
  "background-color",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "box-sizing",
  "color",
  "display",
  "flex-direction",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "height",
  "justify-content",
  "letter-spacing",
  "line-height",
  "margin",
  "opacity",
  "overflow",
  "padding",
  "text-align",
  "text-decoration-line",
  "text-overflow",
  "text-transform",
  "vertical-align",
  "white-space",
  "width",
  "border-collapse",
  "border-spacing",
  "align-items",
  // Without these the clone re-flows: a fixed table falls back to automatic
  // layout, columns resize around the longest lecturer name, and the last day
  // of the week is pushed outside the picture.
  "table-layout",
  "min-width",
  "max-width",
  "overflow-wrap",
  "word-break",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
] as const;

export async function toPng(node: HTMLElement, scale = 2): Promise<string> {
  const clone = node.cloneNode(true) as HTMLElement;
  inlineStyles(node, clone);
  clone.style.margin = "0";

  // Measure the clone rather than the original. Inlined styles never
  // reproduce a layout exactly - a table re-computes its columns, spacing
  // adds up differently - and a picture sized from the original would cut off
  // whatever the clone spilled past it. Laying the clone out off-screen with
  // the same engine gives the size it will really occupy.
  const { width, height } = measureOffScreen(clone, unscrolledSize(node));
  if (width === 0 || height === 0) {
    throw new Error("nothing to export: the timetable has no size on screen");
  }
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;

  // Rasterise onto a canvas with room to spare and crop back to the content
  // afterwards. Text inside an SVG is laid out by a separate document that
  // resolves fonts its own way, so the drawing can end up a little larger
  // than any measurement taken here; the margin absorbs that, and the crop
  // means nobody ever sees it.
  const canvasWidth = Math.ceil(width * OVERDRAW + PADDING);
  const canvasHeight = Math.ceil(height * OVERDRAW + PADDING);

  const serialised = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${serialised}</div>` +
    `</foreignObject></svg>`;

  const image = await load(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(canvasWidth * scale);
  canvas.height = Math.ceil(canvasHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("this browser cannot draw to a canvas");

  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.drawImage(image, 0, 0);

  return trim(canvas, Math.ceil(PADDING * scale) / 2).toDataURL("image/png");
}

/**
 * Cut the uniform background away from the edges.
 *
 * `margin` leaves a little of it back, so the timetable is not flush against
 * the edge of the picture.
 */
function trim(canvas: HTMLCanvasElement, margin: number): HTMLCanvasElement {
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let top = canvas.height;
  let left = canvas.width;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const at = (y * canvas.width + x) * 4;
      // The background is opaque white; anything else is content.
      if (data[at] > 250 && data[at + 1] > 250 && data[at + 2] > 250) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (right <= left || bottom <= top) return canvas;

  const x0 = Math.max(0, left - margin);
  const y0 = Math.max(0, top - margin);
  const width = Math.min(canvas.width, right + margin) - x0;
  const height = Math.min(canvas.height, bottom + margin) - y0;

  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  const target = cropped.getContext("2d");
  if (!target) return canvas;
  target.fillStyle = BACKGROUND;
  target.fillRect(0, 0, width, height);
  target.drawImage(canvas, x0, y0, width, height, 0, 0, width, height);
  return cropped;
}

export async function downloadPng(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  const url = await toPng(node);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

/**
 * Lay the clone out off-screen and report how much room it actually needs.
 *
 * `hint` is the size the original occupies, used as the starting width so
 * anything width-dependent settles the same way before being measured.
 */
function measureOffScreen(
  clone: HTMLElement,
  hint: { width: number; height: number },
): { width: number; height: number } {
  const stage = document.createElement("div");
  stage.style.cssText =
    "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
  clone.style.width = `${hint.width}px`;
  clone.style.height = "auto";
  stage.appendChild(clone);
  document.body.appendChild(stage);

  try {
    const { width, height } = unscrolledSize(clone);
    return { width: Math.max(width, hint.width), height: Math.max(height, 1) };
  } finally {
    stage.remove();
  }
}

/** How large the node would be if nothing inside it scrolled. */
function unscrolledSize(node: HTMLElement): { width: number; height: number } {
  const box = node.getBoundingClientRect();
  let width = Math.max(node.scrollWidth, box.width);
  let height = Math.max(node.scrollHeight, box.height);

  for (const child of node.querySelectorAll<HTMLElement>("*")) {
    if (child.scrollWidth <= child.clientWidth && child.scrollHeight <= child.clientHeight) {
      continue;
    }
    const childBox = child.getBoundingClientRect();
    width = Math.max(width, childBox.left - box.left + child.scrollWidth);
    height = Math.max(height, childBox.top - box.top + child.scrollHeight);
  }
  // Leave room for whatever padding or border the exported node carries.
  const style = window.getComputedStyle(node);
  width += parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
  height += parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);

  return { width: Math.ceil(width), height: Math.ceil(height) };
}

/** Walk source and clone together, copying the styles that matter. */
function inlineStyles(source: HTMLElement, clone: HTMLElement): void {
  const sourceNodes = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll<HTMLElement>("*")];

  for (let i = 0; i < sourceNodes.length; i += 1) {
    const computed = window.getComputedStyle(sourceNodes[i]);
    const target = cloneNodes[i];
    if (!target?.style) continue;

    let declarations = "";
    for (const property of COPIED_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value) declarations += `${property}:${value};`;
    }
    // Unroll any scrolling so the whole content is inside the picture and no
    // scrollbar is painted into it.
    const element = sourceNodes[i];
    if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) {
      declarations += `overflow:visible;width:${element.scrollWidth}px;height:${element.scrollHeight}px;`;
    } else if (/auto|scroll/.test(computed.overflow)) {
      declarations += "overflow:visible;";
    }

    target.setAttribute("style", declarations);
    // Class names are useless without the stylesheet and only bloat the file.
    target.removeAttribute("class");
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(
      () => reject(new Error("the image took too long to render")),
      15_000,
    );
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("the timetable could not be turned into an image"));
    };
    image.src = url;
  });
}
