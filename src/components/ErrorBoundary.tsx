import { Component, ReactNode } from 'react';

type State = { hasError: boolean; message?: string };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('App error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-slate-50 text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 text-2xl font-bold">!</div>
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="text-sm text-slate-500 max-w-md">
            The app hit an unexpected error. Try reloading the page. If it keeps happening, your Supabase connection may need checking.
          </p>
          {this.state.message && (
            <pre className="text-xs text-slate-400 bg-white rounded-lg p-3 border border-slate-200 max-w-md overflow-x-auto">{this.state.message}</pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
