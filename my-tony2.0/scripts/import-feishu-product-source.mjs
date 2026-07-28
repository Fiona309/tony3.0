import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const DOC_TOKEN = 'R3fpdKidmo1FSFxv2EZcNnEMnCg';
const outputRoot = path.join(
  process.cwd(),
  'knowledge-base',
  'products',
  'source-assets',
);

function slugBrand(title) {
  return title
    .replace(/^\d+\./, '')
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .toLowerCase();
}

function parseDocument(content) {
  const tags = content.match(/<(?:p|img)\b[^>]*>(?:[^<]*)<\/p>|<img\b[^>]*\/>/g) ?? [];
  const groups = [];
  let current = null;

  for (const tag of tags) {
    if (tag.startsWith('<p')) {
      const text = tag.replace(/<[^>]+>/g, '').trim();
      const match = text.match(/^(\d+)\.(.+)$/);
      if (match) {
        current = {
          order: Number(match[1]),
          title: match[2].trim(),
          slug: slugBrand(text),
          images: [],
        };
        groups.push(current);
      } else if (current && text) {
        current.title += text;
        current.slug = slugBrand(current.title);
      }
      continue;
    }

    if (!current) continue;
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
    );
    current.images.push({
      index: current.images.length + 1,
      token: attrs.src,
      block_id: attrs.id,
      source_name: attrs.name,
      width: Number(attrs.width),
      height: Number(attrs.height),
    });
  }

  return groups;
}

async function downloadImage(group, image) {
  const brandDir = path.join(outputRoot, `${String(group.order).padStart(2, '0')}-${group.slug}`);
  await mkdir(brandDir, { recursive: true });
  const baseName = `${String(image.index).padStart(3, '0')}-${image.token}`;
  const relativeOutput = path.relative(process.cwd(), path.join(brandDir, baseName));
  await execFileAsync(
    'lark-cli',
    [
      'docs',
      '+media-download',
      '--token',
      image.token,
      '--output',
      relativeOutput,
      '--as',
      'user',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
        LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
      },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

async function runPool(tasks, concurrency) {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      await task();
    }
  });
  await Promise.all(workers);
}

const { stdout } = await execFileAsync(
  'lark-cli',
  [
    'docs',
    '+fetch',
    '--doc',
    DOC_TOKEN,
    '--detail',
    'with-ids',
    '--doc-format',
    'xml',
    '--as',
    'user',
    '--format',
    'json',
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
    },
    maxBuffer: 32 * 1024 * 1024,
  },
);

const payload = JSON.parse(stdout);
if (!payload.ok) {
  throw new Error(`Fetch failed: ${stdout}`);
}

const groups = parseDocument(payload.data.document.content);
await mkdir(outputRoot, { recursive: true });
await writeFile(
  path.join(outputRoot, 'source-manifest.json'),
  `${JSON.stringify(
    {
      source_doc: DOC_TOKEN,
      revision_id: payload.data.document.revision_id,
      imported_at: new Date().toISOString(),
      brand_count: groups.length,
      image_count: groups.reduce((sum, group) => sum + group.images.length, 0),
      groups,
    },
    null,
    2,
  )}\n`,
);

const tasks = groups.flatMap((group) =>
  group.images.map((image) => () => downloadImage(group, image)),
);
await runPool(tasks, 4);

console.log(
  JSON.stringify({
    brands: groups.map(({ order, title, images }) => ({
      order,
      title,
      images: images.length,
    })),
    image_count: tasks.length,
    output: outputRoot,
  }),
);
