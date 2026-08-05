import { HairMirror } from '../tony/hair-mirror';

export default function MirrorPage() {
  return (
    <main className="tony-app relative mx-auto flex min-h-0 flex-col overflow-hidden bg-cream md:my-5 md:rounded-[34px] md:border-2 md:border-ink">
      <HairMirror initialLevel={5} initialFamily="蓝色" />
    </main>
  );
}
