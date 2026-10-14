// A step's page is an ordered list of blocks, built like a Notion page. Each step chooses its own blocks:
// a video or not, text, links, files, a quick check, paperwork to sign, an app to set up — in any order.
//
//   video     { url, transcript }            YouTube / Vimeo / Loom link or an uploaded file ("" = coming soon)
//   h p quote callout { text }               text
//   list checklist steps { items }           lists
//   dodont    { do, dont }                   do / don't
//   takeaways { items }                      "Key takeaways" card
//   links     { items: [{label, url}] }      links and sources
//   files     {}                             this step's downloads (uploaded in the builder)
//   quiz      {}                             this step's quick check (questions edited in the builder)
//   form      { formId }                     an agreement to sign / form to hand in (from Paperwork)
//   app       { appId }                      a tool the team uses (from Tools)
//   divider   {}
import { fail, intId } from './http.mjs';
import { linksOf, parseList } from './shapes.mjs';
import * as v from './validate.mjs';

export const TEXT_TYPES = new Set(['h', 'p', 'quote', 'callout']);
export const LIST_TYPES = new Set(['list', 'checklist', 'steps']);
export const PAGE_TYPES = new Set([...TEXT_TYPES, ...LIST_TYPES, 'dodont', 'video', 'takeaways', 'links', 'files', 'quiz', 'form', 'app', 'divider']);
const MAX_BLOCKS = 150;

const parseJson = (raw, fallback) => {
  try {
    const x = JSON.parse(raw || 'null');
    return x ?? fallback;
  } catch {
    return fallback;
  }
};

/** Blocks for a lesson written before pages had blocks: the same content, in the order it used to show. */
export function legacyBlocks(l, { hasQuiz = false, hasFiles = false } = {}) {
  const out = [{ type: 'video', url: l.video_url || '', transcript: l.transcript || '' }];
  if (l.overview) out.push({ type: 'p', text: l.overview });
  const takeaways = parseList(l.takeaways);
  if (takeaways.length) out.push({ type: 'takeaways', items: takeaways });
  const content = parseJson(l.content, []);
  if (Array.isArray(content)) out.push(...content);
  const links = linksOf(l.links);
  if (links.length) out.push({ type: 'links', items: links });
  if (hasFiles) out.push({ type: 'files' });
  if (hasQuiz) out.push({ type: 'quiz' });
  return out;
}

/** The page for a lesson row. */
export function pageBlocksOf(l) {
  const saved = parseJson(l.blocks, null);
  return Array.isArray(saved) ? saved : legacyBlocks(l);
}

/** Make sure a step's quiz and files show somewhere: add them at the end if no block places them. */
export function completeBlocks(blocks, { hasQuiz, hasFiles }) {
  const out = [...blocks];
  if (hasFiles && !out.some((b) => b.type === 'files')) out.push({ type: 'files' });
  if (hasQuiz && !out.some((b) => b.type === 'quiz')) out.push({ type: 'quiz' });
  return out;
}

export const firstVideoUrl = (blocks) => blocks.find((b) => b.type === 'video')?.url || '';

/** Set the step's video (Videos page): fill the first video block, or put one at the top. */
export function withVideo(blocks, url) {
  const i = blocks.findIndex((b) => b.type === 'video');
  if (i >= 0) return blocks.map((b, j) => (j === i ? { ...b, url } : b));
  return url ? [{ type: 'video', url, transcript: '' }, ...blocks] : blocks;
}

/** Validate blocks from the builder. form/app ids must belong to this practice. */
export function validatePageBlocks(ctx, value) {
  if (!Array.isArray(value) || value.length > MAX_BLOCKS) fail(400, `A page can have up to ${MAX_BLOCKS} blocks.`);
  const items = (list, where, max = 600) => {
    if (!Array.isArray(list) || list.length > 40) fail(400, `${where} must be a list of up to 40 items.`);
    return list.map((x) => v.text(x, `${where} item`, { max }));
  };
  const pid = ctx.user.practice_id;
  return value.map((b, i) => {
    const where = `Block ${i + 1}`;
    if (!b || typeof b !== 'object' || !PAGE_TYPES.has(b.type)) fail(400, `${where} has an unknown type.`);
    switch (b.type) {
      case 'video':
        return { type: 'video', url: v.url(b.url ?? '', `${where} video link`, { allowLocalVideo: true }), transcript: v.text(b.transcript ?? '', `${where} transcript`, { max: 200000, optional: true }) };
      case 'takeaways':
        return { type: 'takeaways', items: items(b.items ?? [], `${where} takeaways`, 300) };
      case 'dodont':
        return { type: 'dodont', do: items(b.do ?? [], `${where} "do"`), dont: items(b.dont ?? [], `${where} "don't"`) };
      case 'links':
        return { type: 'links', items: v.links(b.items ?? [], `${where} links`) };
      case 'form': {
        const id = intId(b.formId);
        if (!ctx.db.prepare('SELECT 1 FROM forms WHERE id = ? AND practice_id = ?').get(id, pid)) fail(400, `${where}: pick a paperwork item.`);
        return { type: 'form', formId: id };
      }
      case 'app': {
        const id = intId(b.appId);
        if (!ctx.db.prepare('SELECT 1 FROM apps WHERE id = ? AND practice_id = ?').get(id, pid)) fail(400, `${where}: pick a tool.`);
        return { type: 'app', appId: id };
      }
      case 'files':
      case 'quiz':
      case 'divider':
        return { type: b.type };
      default:
        if (LIST_TYPES.has(b.type)) return { type: b.type, items: items(b.items ?? [], where) };
        return { type: b.type, text: v.text(b.text ?? '', where, { max: b.type === 'h' ? 160 : 4000 }) };
    }
  });
}
