import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface BoundaryState {
  error: Error | null;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Limit state .VYROX runtime error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#06080c] p-6 text-slate-100">
          <div className="max-w-md border border-rose-500/40 bg-[#0b1018] p-6 shadow-2xl">
            <div className="text-[11px] font-bold tracking-widest text-rose-400 uppercase">
              Limit state .VYROX
            </div>
            <h1 className="mt-1 text-lg font-bold tracking-wide text-white uppercase">
              Viewport Recovery Required
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              {this.state.error.message || 'An unexpected rendering error occurred.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 border border-sky-400/50 bg-sky-500 px-4 py-2 text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
