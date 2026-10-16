import { Component, type ReactNode } from 'react';

/** Keeps one broken page from blanking the whole dashboard. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-xl">
        <p className="statement text-[28px]">This page couldn’t be shown.</p>
        <p className="mt-4 text-[14px] leading-relaxed text-dim">
          Your data is safe; this is a display problem. Try another page, or reload. If it keeps happening, the message below helps pin it down.
        </p>
        <pre className="mt-6 overflow-x-auto rounded-lg bg-raise p-4 text-[12px] text-dim">{this.state.error.message}</pre>
        <button onClick={() => location.reload()} className="mt-6 rounded-lg border border-line-strong px-4 py-2 text-[14px] hover:bg-raise-2">
          Reload
        </button>
      </div>
    );
  }
}
