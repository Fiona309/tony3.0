'use client';

import { useEffect, useState } from 'react';

import { HairMirror } from '../tony/hair-mirror';
import type { ColorMatrix } from '../tony/hair-mirror-core';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';

export default function MirrorPage() {
  const [matrix, setMatrix] = useState<ColorMatrix | null>(null);
  const [level, setLevel] = useState(5);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${API}/color-matrix`)
      .then((r) => r.json())
      .then((j) => setMatrix(j.data))
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <main className="tony-app relative mx-auto flex min-h-0 flex-col overflow-hidden bg-cream md:my-5 md:rounded-[34px] md:border-2 md:border-ink">
      {matrix ? (
        <HairMirror matrix={matrix} level={level} onLevelChange={setLevel} />
      ) : (
        <div className="grid flex-1 place-items-center text-sm text-ink-3">{err || '加载中…'}</div>
      )}
    </main>
  );
}
