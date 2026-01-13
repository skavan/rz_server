import type { CheerioAPI } from 'cheerio';
import type { BookmarkNode, BookmarkOptions } from '../types.js';

interface FlatBookmark {
  title: string;
  level: number;
  id?: string;
}

function buildBookmarkTree(flat: FlatBookmark[]): BookmarkNode[] {
  const root: BookmarkNode[] = [];
  const stack: BookmarkNode[] = [];

  for (const item of flat) {
    const node: BookmarkNode = {
      title: item.title,
      level: item.level,
      id: item.id,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return root;
}

export function extractBookmarks(
  $: CheerioAPI,
  options: BookmarkOptions
): BookmarkNode[] {
  if (options.enabled === false) {
    return [];
  }

  const flat: FlatBookmark[] = [];

  $('[data-pdf-bookmark]').each((_, el) => {
    const $el = $(el);
    const title = $el.attr('data-pdf-bookmark');
    if (!title) return;

    const levelAttr = $el.attr('data-pdf-bookmark-level');
    const level = levelAttr ? parseInt(levelAttr, 10) : 1;
    const id = $el.attr('data-pdf-bookmark-id');

    flat.push({ title, level: isNaN(level) ? 1 : level, id });
  });

  if (flat.length === 0 && options.autoFromHeadings) {
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName.toLowerCase();
      const level = parseInt(tagName.charAt(1), 10);
      const title = $el.text().trim();
      if (!title) return;

      const id = $el.attr('id');
      flat.push({ title, level, id });
    });
  }

  return buildBookmarkTree(flat);
}
