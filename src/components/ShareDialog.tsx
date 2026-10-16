import { useEffect, useRef, useState } from 'react';
import { copyCard, downloadCard, renderCard, type CardSpec } from '../sharing/cards';
import { Button } from './ui';

export function ShareDialog({ spec, filename, onClose }: { spec: CardSpec; filename: string; onClose: () => void }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    let revoked: string | null = null;
    renderCard(spec).then((c) => {
      setCanvas(c);
      c.toBlob((b) => {
        if (!b) return;
        revoked = URL.createObjectURL(b);
        setUrl(revoked);
      });
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [spec]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto max-h-[92vh] w-[min(440px,92vw)] rounded-2xl border border-line-strong bg-raise p-0 text-paper backdrop:bg-black/70"
    >
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-medium">Share card</h2>
          <button onClick={() => dialog.current?.close()} className="rounded-md px-2 py-1 text-[13px] text-dim hover:text-paper">
            Close
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-ink" style={{ aspectRatio: '4 / 5' }}>
          {url ? <img src={url} alt="Preview of your share card" className="h-full w-full" /> : <div className="grid h-full place-items-center text-[13px] text-dim">Drawing your card…</div>}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" className="flex-1" disabled={!canvas} onClick={() => canvas && downloadCard(canvas, filename).then(() => setStatus('Saved to your downloads.'))}>
            Download image
          </Button>
          <Button
            className="flex-1"
            disabled={!canvas}
            onClick={() =>
              canvas &&
              copyCard(canvas)
                .then(() => setStatus('Copied. Paste it anywhere.'))
                .catch(() => setStatus('Your browser blocked copying. Use Download instead.'))
            }
          >
            Copy image
          </Button>
        </div>
        <p className="mt-3 min-h-5 text-[12px] text-dim" aria-live="polite">
          {status ?? 'The card shows only what you see here. Nothing is uploaded.'}
        </p>
      </div>
    </dialog>
  );
}
